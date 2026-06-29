"""World Cup betting-spend dashboard: Flask + SocketIO + SQLite.

Run Here:  pip install -r requirements.txt  &&  python app.py"""
import os, time
from flask import Flask, request, session, jsonify, send_from_directory
from flask_sqlalchemy import SQLAlchemy
from flask_socketio import SocketIO, emit
from sqlalchemy import func
from werkzeug.security import generate_password_hash, check_password_hash

DB = os.path.join(os.path.dirname(__file__), "app.db")
DIST = os.path.join(os.path.dirname(__file__), "frontend", "dist")

app = Flask(__name__, static_folder=None)
app.secret_key = os.environ.get("SECRET_KEY", "dev-secret-change-me")  # ponytail: fine for a demo; set SECRET_KEY in prod
app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///" + DB
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="threading")
db = SQLAlchemy(app)


class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String, unique=True, nullable=False)
    pw_hash = db.Column(db.String, nullable=False)


class Bet(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    match = db.Column(db.String)
    team = db.Column(db.String)
    amount = db.Column(db.Float)
    odds = db.Column(db.Float)
    ts = db.Column(db.Float)


def aggregates():
    """Total mock money spent, broken down by team  what the dashboard shows."""
    total = db.session.query(func.coalesce(func.sum(Bet.amount), 0)).scalar()
    rows = (db.session.query(Bet.team,
                             func.sum(Bet.amount).label("spent"),
                             func.count().label("n"))
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
    return jsonify(username=u)


@app.post("/api/login")
def login():
    d = request.get_json(force=True)
    u, p = (d.get("username") or "").strip(), d.get("password") or ""
    user = User.query.filter_by(username=u).first()
    if not user or not check_password_hash(user.pw_hash, p):
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
    user = User.query.filter_by(username=session["user"]).first()
    db.session.add(Bet(user_id=user.id, match=match, team=team,
                       amount=amount, odds=ODDS.get(team, 2.0), ts=time.time()))
    db.session.commit()
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
    with app.app_context():
        db.create_all()
    port = int(os.environ.get("PORT", 5000))
    socketio.run(app, host="0.0.0.0", port=port, debug=True, allow_unsafe_werkzeug=True)
