"""Self-check for the mock-wallet funds gate. Run: python test_wallet.py"""
import os, tempfile

# point at a throwaway DB before import so we never touch the real app.db
os.environ["APP_DB"] = tempfile.NamedTemporaryFile(suffix=".db", delete=False).name
import app

app.app.config["TESTING"] = True
c = app.app.test_client()

with app.app.app_context():
    app.ensure_schema()

# fresh account starts broke -> a bet must be refused
c.post("/api/signup", json={"username": "esosa", "password": "pw"})
r = c.post("/api/bet", json={"team": "Brazil", "amount": 50})
assert r.status_code == 402, "broke wallet must block the bet"

# deposit, then the same bet clears and the balance is debited
c.post("/api/deposit", json={"amount": 100})
r = c.post("/api/bet", json={"team": "Brazil", "amount": 50})
assert r.status_code == 200 and r.get_json()["balance"] == 50, "funded bet should debit"

# can't overspend what's left
assert c.post("/api/bet", json={"team": "Brazil", "amount": 999}).status_code == 402

# second user's bets stay separate from the first's history
c2 = app.app.test_client()
c2.post("/api/signup", json={"username": "bob", "password": "pw"})
c2.post("/api/deposit", json={"amount": 100})
c2.post("/api/bet", json={"team": "France", "amount": 20})
with app.app.app_context():
    esosa = app.User.query.filter_by(username="esosa").first()
    bob = app.User.query.filter_by(username="bob").first()
    assert app.aggregates(esosa.id)["total"] == 50, "esosa sees only her own spend"
    assert app.aggregates(bob.id)["total"] == 20, "bob sees only his own spend"
print("ok")
