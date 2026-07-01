"""World Cup betting-spend dashboard: Flask + SocketIO + SQLite.

Live data from https://worldcup26.ir (World Cup 2026 API).
Run: pip install -r requirements.txt && python app.py"""
import os, time, json, mimetypes
from datetime import datetime, timezone
import requests
from flask import Flask, request, session, jsonify, send_from_directory
from flask_sqlalchemy import SQLAlchemy
from flask_socketio import SocketIO, emit, join_room
from sqlalchemy import func
from werkzeug.security import generate_password_hash, check_password_hash
from props import build_stats, build_props

WC_API = os.environ.get("WC_API_URL", "https://worldcup26.ir").rstrip("/")
WC_TOKEN = os.environ.get("WC_API_TOKEN", "")

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


# --- World Cup 2026 API (worldcup26.ir) -----------------------------------
WC_CACHE = os.path.join(os.path.dirname(__file__), "wc_cache.json")
WC_TTL = int(os.environ.get("WC_CACHE_TTL", 120))  # live scores: refresh every 2 min
ODDS = {}   # team -> decimal odds (derived from group standings)
GAMES = []  # raw match dicts from /get/games
STATS = {}
PROPS = {}
DEMO_ODDS = {
    "Brazil": 4.5, "France": 5.0, "Argentina": 6.0, "England": 7.0,
    "Spain": 8.0, "Germany": 10.0, "Portugal": 12.0, "Netherlands": 14.0,
}


def wc_get(path):
    """GET from the World Cup 2026 API; optional JWT via WC_API_TOKEN."""
    headers = {"Authorization": f"Bearer {WC_TOKEN}"} if WC_TOKEN else {}
    r = requests.get(f"{WC_API}{path}", headers=headers, timeout=15)
    r.raise_for_status()
    return r.json()


def _wc_fresh():
    return os.path.exists(WC_CACHE) and time.time() - os.path.getmtime(WC_CACHE) < WC_TTL


def _wc_read():
    return json.load(open(WC_CACHE)) if os.path.exists(WC_CACHE) else {}


def _wc_write(data):
    json.dump(data, open(WC_CACHE, "w"))


def _parse_wc_date(raw):
    """06/11/2026 13:00 -> ISO string for the client."""
    try:
        return datetime.strptime(raw, "%m/%d/%Y %H:%M").replace(tzinfo=timezone.utc).isoformat()
    except (TypeError, ValueError):
        return datetime.now(timezone.utc).isoformat()


def _wc_ts(g):
    return datetime.fromisoformat(_parse_wc_date(g.get("local_date")).replace("Z", "+00:00")).timestamp()


def _wc_status(g):
    elapsed = (g.get("time_elapsed") or "").lower()
    if (g.get("finished") or "").upper() == "TRUE" or elapsed == "finished":
        return "final"
    if elapsed and elapsed != "notstarted":
        return "live"
    return "upcoming"


def _wc_team(g, side):
    return g.get(f"{side}_team_name_en") or g.get(f"{side}_team_label") or "TBD"


def odds_from_standings(groups, teams):
    """Tournament-winner style decimal odds from group points (higher pts -> shorter odds)."""
    by_id = {t["id"]: t["name_en"] for t in teams}
    weights = {}
    for grp in groups.get("groups", []):
        for row in grp.get("teams", []):
            name = by_id.get(row.get("team_id"))
            if name:
                weights[name] = max(int(row.get("pts") or 0), 1)
    if not weights:
        return {}
    total = sum(weights.values())
    return {name: round(total / w, 2) for name, w in weights.items()}


def demo_games():
    """Fallback when the API is unreachable."""
    now = time.time()
    iso = lambda off: datetime.fromtimestamp(now + off, timezone.utc).isoformat()
    return [
        {"id": "d1", "local_date": "demo", "finished": "FALSE", "time_elapsed": "45'",
         "home_team_name_en": "Brazil", "away_team_name_en": "Serbia",
         "home_score": "1", "away_score": "0", "_commence": iso(-3600)},
        {"id": "d2", "local_date": "demo", "finished": "FALSE", "time_elapsed": "notstarted",
         "home_team_name_en": "France", "away_team_name_en": "Australia",
         "home_score": "0", "away_score": "0", "_commence": iso(3600)},
        {"id": "d3", "local_date": "demo", "finished": "TRUE", "time_elapsed": "finished",
         "home_team_name_en": "Argentina", "away_team_name_en": "Mexico",
         "home_score": "2", "away_score": "0", "_commence": iso(-2 * 86400)},
    ]


def list_games(raw):
    """Shape API matches for the client; live + upcoming + finals from last 3 days."""
    now = time.time()
    cutoff = 3 * 86400
    out = []
    for g in raw:
        st = _wc_status(g)
        ts = _wc_ts(g) if g.get("local_date") != "demo" else datetime.fromisoformat(
            g["_commence"].replace("Z", "+00:00")).timestamp()
        if st == "final" and now - ts > cutoff:
            continue
        commence = g.get("_commence") or _parse_wc_date(g.get("local_date"))
        out.append({
            "id": g.get("id"), "home": _wc_team(g, "home"), "away": _wc_team(g, "away"),
            "commence_time": commence, "status": st,
            "home_score": g.get("home_score"), "away_score": g.get("away_score"),
            "group": g.get("group"), "stage": g.get("type"),
            "minute": g.get("time_elapsed") if st == "live" else None,
        })
    rank = {"live": 0, "upcoming": 1, "final": 2}
    out.sort(key=lambda x: (rank[x["status"]],
                            datetime.fromisoformat(x["commence_time"].replace("Z", "+00:00")).timestamp()
                            * (-1 if x["status"] == "final" else 1)))
    return out


def load_wc():
    """Fetch games, teams, and groups; cache together for odds + stats."""
    if _wc_fresh():
        return _wc_read()
    try:
        games = wc_get("/get/games").get("games", [])
        teams = wc_get("/get/teams")
        if isinstance(teams, dict):
            teams = teams.get("teams", [])
        groups = wc_get("/get/groups")
        if games:
            data = {"games": games, "teams": teams, "groups": groups}
            _wc_write(data)
            return data
    except Exception as e:
        print("world cup API fetch failed:", e)
    cached = _wc_read()
    if cached.get("games"):
        return cached
    return {"games": demo_games(), "teams": [], "groups": {}}


def refresh_odds():
    global ODDS
    data = load_wc()
    ODDS = odds_from_standings(data.get("groups", {}), data.get("teams", [])) or DEMO_ODDS


def refresh_games():
    global GAMES
    GAMES = load_wc().get("games", demo_games())


def load_stats():
    """Leaderboards + props from match scorers and group standings."""
    global STATS, PROPS
    data = load_wc()
    games, groups, teams = data.get("games", []), data.get("groups", {}), data.get("teams", [])
    if not games:
        return
    STATS = build_stats(games, groups, teams)
    PROPS = build_props(games, groups, teams)


refresh_stats = load_stats


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


def _emit_feed():
    socketio.emit("odds", ODDS)
    socketio.emit("games", list_games(GAMES))
    socketio.emit("player_stats", STATS)
    socketio.emit("props", PROPS)


def _refresh_loop():
    """Re-fetch World Cup data on cache expiry and push to all clients."""
    while True:
        socketio.sleep(WC_TTL)
        refresh_odds()
        refresh_games()
        load_stats()
        _emit_feed()


@socketio.on("connect")
def on_connect():
    refresh_odds()
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
    socketio.start_background_task(_refresh_loop)
    # ponytail: no blocking API fetches here  they'd delay the port bind past
    # Railway's healthcheck (502). on_connect seeds odds/games/stats lazily instead.
    port = int(os.environ.get("PORT", 5000))
    socketio.run(app, host="0.0.0.0", port=port,
                 debug=bool(os.environ.get("DEBUG")), allow_unsafe_werkzeug=True)
