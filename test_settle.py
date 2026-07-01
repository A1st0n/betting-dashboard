"""Self-check for bet settlement (money path). Run: python test_settle.py"""
import os, tempfile
os.environ["APP_DB"] = tempfile.NamedTemporaryFile(suffix=".db", delete=False).name
import app

app.app.config["TESTING"] = True
c = app.app.test_client()
with app.app.app_context():
    app.ensure_schema()

c.post("/api/signup", json={"username": "z", "password": "p"})
c.post("/api/deposit", json={"amount": 100})
c.post("/api/bet", json={"team": "Brazil", "amount": 40, "odds": 2.5})   # win -> +100
c.post("/api/bet", json={"team": "France", "amount": 20, "odds": 2.0})   # lose -> +0

# Brazil won, France lost; both games kicked off after the bets (ts>=0)
app.GAMES = [
    {"id": "1", "home_team": "Brazil", "away_team": "Serbia", "completed": True,
     "commence_time": "2999-01-01T00:00:00Z",
     "scores": [{"name": "Brazil", "score": "2"}, {"name": "Serbia", "score": "0"}]},
    {"id": "2", "home_team": "France", "away_team": "Spain", "completed": True,
     "commence_time": "2999-01-01T00:00:00Z",
     "scores": [{"name": "France", "score": "0"}, {"name": "Spain", "score": "1"}]},
]
with app.app.app_context():
    app.settle_bets()
    bal = app.User.query.filter_by(username="z").first().balance

# started 100, staked 60 -> 40 left, Brazil win pays 40*2.5=100 -> 140
assert bal == 140, f"expected 140, got {bal}"
statuses = sorted(b["status"] for b in c.get("/api/mybets").get_json()["bets"])
assert statuses == ["lost", "won"], statuses
print("ok")
