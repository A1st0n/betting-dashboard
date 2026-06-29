"""World Cup betting-spend dashboard: Flask + SocketIO + SQLite.

Run Here:  pip install -r requirements.txt  &&  python app.py"""
import os, sqlite3, time
from flask import Flask, request, session, jsonify, send_from_directory
from flask_socketio import SocketIO, emit
from werkzeug.security import generate_password_hash, check_password_hash

DB = os.path.join(os.path.dirname(__file__), "app.db")
DIST = os.path.join(os.path.dirname(__file__), "frontend", "dist")

app = Flask(__name__, static_folder=None)
app.secret_key = os.environ.get("SECRET_KEY", "dev-secret-change-me")  # ponytail: fine for a demo; set SECRET_KEY in prod
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="threading")


def db():
    c = sqlite3.connect(DB)
    c.row_factory = sqlite3.Row
    return c


def init_db():
    with db() as c:
        c.executescript("""
        CREATE TABLE IF NOT EXISTS users(
            id INTEGER PRIMARY KEY, username TEXT UNIQUE, pw_hash TEXT);
        CREATE TABLE IF NOT EXISTS bets(
            id INTEGER PRIMARY KEY, user_id INTEGER, match TEXT, team TEXT,
            amount REAL, odds REAL, ts REAL);
        """)


def aggregates():
    """Total mock money spent, broken down by team — what the dashboard shows."""
    with db() as c:
        total = c.execute("SELECT COALESCE(SUM(amount),0) t FROM bets").fetchone()["t"]
        rows = c.execute(
            "SELECT team, SUM(amount) spent, COUNT(*) n FROM bets "
            "GROUP BY team ORDER BY spent DESC").fetchall()
    return {"total": total, "by_team": [dict(r) for r in rows]}


# --- auth ---------------------------------------------------------------
@app.post("/api/signup")
def signup():
    d = request.get_json(force=True)
    u, p = (d.get("username") or "").strip(), d.get("password") or ""
    if not u or not p:
        return jsonify(error="username and password required"), 400
    try:
        with db() as c:
            c.execute("INSERT INTO users(username,pw_hash) VALUES(?,?)",
                      (u, generate_password_hash(p, method="pbkdf2:sha256")))  # salted
    except sqlite3.IntegrityError:
        return jsonify(error="username taken"), 409
    session["user"] = u
    return jsonify(username=u)


@app.post("/api/login")
def login():
    d = request.get_json(force=True)
    u, p = (d.get("username") or "").strip(), d.get("password") or ""
    with db() as c:
        row = c.execute("SELECT * FROM users WHERE username=?", (u,)).fetchone()
    if not row or not check_password_hash(row["pw_hash"], p):
        return jsonify(error="bad credentials"), 401
    session["user"] = u
    return jsonify(username=u)


@app.post("/api/logout")
def logout():
    session.clear()
    return jsonify(ok=True)


@app.get("/api/me")
def me():
    return jsonify(username=session.get("user"))


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
    with db() as c:
        uid = c.execute("SELECT id FROM users WHERE username=?",
                        (session["user"],)).fetchone()["id"]
        odds = ODDS.get(team, 2.0)
        c.execute("INSERT INTO bets(user_id,match,team,amount,odds,ts) "
                  "VALUES(?,?,?,?,?,?)", (uid, match, team, amount, odds, time.time()))
    socketio.emit("aggregates", aggregates())  # live push to everyone
    return jsonify(ok=True)


# --- odds (static team list) 
ODDS = {  # team -> decimal odds; static for now
    "Argentina": 2.5, "France": 2.8, "Brazil": 3.0,
    "England": 4.0, "Spain": 4.5, "Germany": 5.0,
}


@socketio.on("connect")
def on_connect():
    emit("odds", ODDS)
    emit("aggregates", aggregates())


# --- serve built React 
@app.get("/")
@app.get("/<path:path>")
def spa(path=""):
    full = os.path.join(DIST, path)
    if path and os.path.isfile(full):
        return send_from_directory(DIST, path)
    if os.path.isfile(os.path.join(DIST, "index.html")):
        return send_from_directory(DIST, "index.html")
    return ("Frontend not built yet. Run: cd frontend && npm install && npm run build", 200)


if __name__ == "__main__":
    init_db()
    port = int(os.environ.get("PORT", 5000))
    socketio.run(app, host="0.0.0.0", port=port, debug=True, allow_unsafe_werkzeug=True)
