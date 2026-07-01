"""World Cup betting-spend dashboard: Flask + SocketIO + SQLite.

Run Here:  pip install -r requirements.txt  &&  python app.py"""
import os, time, json, mimetypes
from datetime import datetime, timezone
import requests
from flask import Flask, request, session, jsonify, send_from_directory
from flask_sqlalchemy import SQLAlchemy
from flask_socketio import SocketIO, emit, join_room
from sqlalchemy import func
from werkzeug.security import generate_password_hash, check_password_hash
from props import build_stats, build_props

DB = os.environ.get("APP_DB", os.path.join(os.path.dirname(__file__), "app.db"))
DIST = os.path.join(os.path.dirname(__file__), "frontend", "dist")

mimetypes.add_type("application/javascript", ".js")

# load .env (ponytail: 4 lines beats adding python-dotenv)
_envf = os.path.join(os.path.dirname(__file__), ".env")
if os.path.exists(_envf):
    for _l in open(_envf):
        if "=" in _l and not _l.lstrip().startswith("#"):
            _k, _v = _l.strip().split("=", 1)
            os.environ.setdefault(_k, _v)

app = Flask(__name__, static_folder=None)
app.secret_key = os.environ.get("SECRET_KEY", "dev-secret-change-me")  # ponytail: fine for a demo; set SECRET_KEY in prod
app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///" + DB
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="threading")
db = SQLAlchemy(app)


class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String, unique=True, nullable=False)
    pw_hash = db.Column(db.String, nullable=False)
    balance = db.Column(db.Float, nullable=False, default=0.0)  # mock wallet funds


class Bet(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    match = db.Column(db.String)
    team = db.Column(db.String)
    amount = db.Column(db.Float)
    odds = db.Column(db.Float)
    ts = db.Column(db.Float)


def aggregates(user_id):
    """One user's mock spend, broken down by team  what the dashboard shows."""
    total = (db.session.query(func.coalesce(func.sum(Bet.amount), 0))
             .filter(Bet.user_id == user_id).scalar())
    rows = (db.session.query(Bet.team,
                             func.sum(Bet.amount).label("spent"),
                             func.count().label("n"))
            .filter(Bet.user_id == user_id)
            .group_by(Bet.team).order_by(func.sum(Bet.amount).desc()).all())
    return {"total": total,
            "by_team": [{"team": t, "spent": s, "n": n} for t, s, n in rows]}


# --- auth ---------------------------------------------------------------
@app.post("/api/signup")
def signup():
    d = request.get_json(force=True)
    u, p = (d.get("username") or "").strip(), d.get("password") or ""
    if not u or not p:
        return jsonify(error="username and password required"), 400
    if User.query.filter_by(username=u).first():
        return jsonify(error="username taken"), 409
    db.session.add(User(username=u,
                        pw_hash=generate_password_hash(p, method="pbkdf2:sha256")))  # salted
    db.session.commit()
    session["user"] = u
    return jsonify(username=u, balance=0.0)


@app.post("/api/login")
def login():
    d = request.get_json(force=True)
    u, p = (d.get("username") or "").strip(), d.get("password") or ""
    user = User.query.filter_by(username=u).first()
    if not user or not check_password_hash(user.pw_hash, p):
        return jsonify(error="bad credentials"), 401
    session["user"] = u
    return jsonify(username=u, balance=user.balance)


@app.post("/api/logout")
def logout():
    session.clear()
    return jsonify(ok=True)


@app.get("/api/me")
def me():
    u = session.get("user")
    user = User.query.filter_by(username=u).first() if u else None
    return jsonify(username=u, balance=user.balance if user else 0.0)


@app.post("/api/deposit")
def deposit():
    if "user" not in session:
        return jsonify(error="login required"), 401
    try:
        amount = float(request.get_json(force=True)["amount"])
    except (KeyError, ValueError, TypeError):
        return jsonify(error="amount must be a number"), 400
    if amount <= 0:
        return jsonify(error="amount must be positive"), 400
    user = User.query.filter_by(username=session["user"]).first()
    user.balance += amount
    db.session.commit()
    return jsonify(balance=user.balance)


# --- bets 
@app.post("/api/bet")
def place_bet():
    if "user" not in session:
        return jsonify(error="login required"), 401
    d = request.get_json(force=True)
    try:
        amount = float(d["amount"])
    except (KeyError, ValueError, TypeError):
        return jsonify(error="amount must be a number"), 400
    if amount <= 0:
        return jsonify(error="amount must be positive"), 400
    match, team = d.get("match", ""), d.get("team", "")
    user = User.query.filter_by(username=session["user"]).first()
    if amount > user.balance:  # mock funds gate: no betting on credit
        return jsonify(error="insufficient funds"), 402
    try:  # props send their own derived odds; team bets fall back to the odds table
        odds = float(d["odds"]) if d.get("odds") is not None else ODDS.get(team, 2.0)
    except (ValueError, TypeError):
        odds = ODDS.get(team, 2.0)  # ponytail: client odds trusted for mock money only
    user.balance -= amount
    db.session.add(Bet(user_id=user.id, match=match, team=team,
                       amount=amount, odds=odds, ts=time.time()))
    db.session.commit()
    socketio.emit("aggregates", aggregates(user.id), room=session["user"])  # live push to this user only
    socketio.emit("leaderboard", leaderboard())  # global board updates for everyone
    return jsonify(ok=True, balance=user.balance)


# --- odds (the-odds-api, cached, max 1 fetch / 24h) ---------------------
ODDS_CACHE = os.path.join(os.path.dirname(__file__), "odds_cache.json")
ODDS_TTL = 24 * 3600
ODDS = {}  # team -> decimal odds
DEMO_ODDS = {
    "Brazil": 4.5,
    "France": 5.0,
    "Argentina": 6.0,
    "England": 7.0,
    "Spain": 8.0,
    "Germany": 10.0,
    "Portugal": 12.0,
    "Netherlands": 14.0,
}


def load_odds():
    """Cached odds, refetched at most once per 24h.
    ponytail: file mtime IS the rate-limit clock  survives restarts, no scheduler."""
    cached = json.load(open(ODDS_CACHE)) if os.path.exists(ODDS_CACHE) else {}
    fresh = cached and time.time() - os.path.getmtime(ODDS_CACHE) < ODDS_TTL
    key = os.environ.get("ODDS_API_KEY")
    if fresh or not key:
        return cached or DEMO_ODDS  # no key/cache: keep the local demo usable
    try:
        r = requests.get(
            "https://api.the-odds-api.com/v4/sports/soccer_fifa_world_cup/odds",
            params={"apiKey": key, "regions": "us", "markets": "h2h"}, timeout=10)
        r.raise_for_status()
        out = {}
        for game in r.json():
            for bm in game.get("bookmakers", [])[:1]:
                for mk in bm.get("markets", []):
                    for oc in mk.get("outcomes", []):
                        out[oc["name"]] = oc["price"]
        if out:
            json.dump(out, open(ODDS_CACHE, "w"))
            return out
    except Exception as e:
        print("odds fetch failed, using cache:", e)
    return cached or DEMO_ODDS


def refresh_odds():
    global ODDS
    ODDS = load_odds()


# --- games (the-odds-api /scores: live + upcoming + completed last 3 days) == pulled from the oddsapi docs
GAMES_CACHE = os.path.join(os.path.dirname(__file__), "games_cache.json")
GAMES_TTL = 24 * 3600  # ponytail: 1 fetch/day to stay in free quota; lower it if you need live scores to tick
GAMES = []      # raw game dicts from the API (status computed at emit time)


def _ts(iso):
    return datetime.fromisoformat(iso.replace("Z", "+00:00")).timestamp()


def demo_games():
    """Time-relative demo so the local app shows one of each status without a key."""
    now = time.time()
    iso = lambda off: datetime.fromtimestamp(now + off, timezone.utc).isoformat()
    sc = lambda h, a, hs, as_: [{"name": h, "score": str(hs)}, {"name": a, "score": str(as_)}]
    return [
        {"id": "d1", "home_team": "Brazil", "away_team": "Serbia",
         "commence_time": iso(-3600), "completed": False, "scores": sc("Brazil", "Serbia", 1, 0)},
        {"id": "d2", "home_team": "France", "away_team": "Australia",
         "commence_time": iso(3600), "completed": False, "scores": None},
        {"id": "d3", "home_team": "Argentina", "away_team": "Mexico",
         "commence_time": iso(-2 * 86400), "completed": True, "scores": sc("Argentina", "Mexico", 2, 0)},
    ]


def list_games(raw):
    """Shape raw games for the client and tag each live / upcoming / final."""
    now = time.time()
    out = []
    for g in raw:
        st = "final" if g.get("completed") else ("live" if _ts(g["commence_time"]) <= now else "upcoming")
        sc = {s["name"]: s["score"] for s in (g.get("scores") or [])}
        out.append({"id": g["id"], "home": g["home_team"], "away": g["away_team"],
                    "commence_time": g["commence_time"], "status": st,
                    "home_score": sc.get(g["home_team"]), "away_score": sc.get(g["away_team"])})
    rank = {"live": 0, "upcoming": 1, "final": 2}
    # live first, then soonest upcoming, then most-recently-finished
    out.sort(key=lambda x: (rank[x["status"]],
                            _ts(x["commence_time"]) * (-1 if x["status"] == "final" else 1)))
    return out


def load_games():
    """live + upcoming + games completed in the last 3 days, cached like odds."""
    cached = json.load(open(GAMES_CACHE)) if os.path.exists(GAMES_CACHE) else []
    fresh = cached and time.time() - os.path.getmtime(GAMES_CACHE) < GAMES_TTL
    key = os.environ.get("ODDS_API_KEY")
    if fresh or not key:
        return cached or demo_games()
    try:
        r = requests.get(
            "https://api.the-odds-api.com/v4/sports/soccer_fifa_world_cup/scores",
            params={"apiKey": key, "daysFrom": 3}, timeout=10)
        r.raise_for_status()
        games = r.json()
        if games:
            json.dump(games, open(GAMES_CACHE, "w"))
            return games
    except Exception as e:
        print("games fetch failed, using cache:", e)
    return cached or demo_games()


def refresh_games():
    global GAMES
    GAMES = load_games()


# --- player stats + props (theanalyst.com's public Opta feed) -----------
# ponytail: current WC tournament id; scrape it off the stats page when it rolls over.
STATS_TMCL = "873cbl9cd9butm4air0mugxzo"
STATS_URL = f"https://dataviz.theanalyst.com/project-data/soccer/{STATS_TMCL}/player-stats.json"
STATS_CACHE = os.path.join(os.path.dirname(__file__), "stats_cache.json")
STATS_TTL = 24 * 3600
STATS = {}  # label -> top-N player rows
PROPS = {}  # market -> player prop lines (derived from the same feed)


def load_stats():
    """Leaderboards + props from one cached fetch, refreshed at most once/24h (public, no key)."""
    global STATS, PROPS
    if os.path.exists(STATS_CACHE) and time.time() - os.path.getmtime(STATS_CACHE) < STATS_TTL:
        cached = json.load(open(STATS_CACHE))
        STATS, PROPS = cached.get("stats", {}), cached.get("props", {})
        return
    try:
        r = requests.get(STATS_URL, timeout=20)
        r.raise_for_status()
        data = r.json()
        STATS, PROPS = build_stats(data), build_props(data)
        if STATS:
            json.dump({"stats": STATS, "props": PROPS}, open(STATS_CACHE, "w"))
    except Exception as e:
        print("stats fetch failed, keeping current:", e)


refresh_stats = load_stats  # alias: fills the STATS/PROPS globals in place


@app.get("/api/user/<username>")
def user_detail(username):
    user = User.query.filter_by(username=username).first()
    if not user:
        return jsonify(error="not found"), 404
    agg = aggregates(user.id)
    bets = sum(t["n"] for t in agg["by_team"])
    return jsonify(user=username, wagered=agg["total"], bets=bets, by_team=agg["by_team"])


def leaderboard(n=10):
    """Global ranking of users by mock money wagered."""
    rows = (db.session.query(User.username,
                             func.coalesce(func.sum(Bet.amount), 0).label("wagered"),
                             func.count(Bet.id).label("bets"))
            .outerjoin(Bet).group_by(User.id)
            .order_by(func.coalesce(func.sum(Bet.amount), 0).desc()).limit(n).all())
    return [{"user": u, "wagered": w, "bets": b} for u, w, b in rows]


@socketio.on("connect")
def on_connect():
    refresh_odds()  # cheap: only hits the API if cache is >24h old
    refresh_games()
    refresh_stats()
    emit("odds", ODDS)
    emit("games", list_games(GAMES))
    emit("player_stats", STATS)
    emit("props", PROPS)
    emit("leaderboard", leaderboard())
    u = session.get("user")  # handshake carries the login cookie
    if u:
        join_room(u)  # bets push back to this room only
        user = User.query.filter_by(username=u).first()
        emit("aggregates", aggregates(user.id))
    else:
        emit("aggregates", {"total": 0, "by_team": []})


# --- serve built React 
@app.get("/")
@app.get("/<path:path>")
def spa(path=""):
    full = os.path.join(DIST, path)
    if path and os.path.isfile(full):
        response = send_from_directory(DIST, path)
        if path.endswith(".js"):
            response.mimetype = "application/javascript"
        return response
    if os.path.isfile(os.path.join(DIST, "index.html")):
        return send_from_directory(DIST, "index.html")
    return ("Frontend not built yet. Run: cd frontend && npm install && npm run build", 200)


def ensure_schema():
    """Add the wallet column to a pre-existing DB. ponytail: one ALTER beats Alembic."""
    db.create_all()
    cols = [r[1] for r in db.session.execute(db.text("PRAGMA table_info(user)"))]
    if "balance" not in cols:
        db.session.execute(db.text("ALTER TABLE user ADD COLUMN balance FLOAT NOT NULL DEFAULT 0"))
        db.session.commit()


if __name__ == "__main__":
    with app.app_context():
        ensure_schema()
    refresh_odds()  # seed odds at startup (fetches only if cache stale/absent)
    refresh_games()
    refresh_stats()
    port = int(os.environ.get("PORT", 5000))
    socketio.run(app, host="0.0.0.0", port=port, debug=True, allow_unsafe_werkzeug=True)
