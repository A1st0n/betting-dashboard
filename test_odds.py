"""Self-check for the 24h odds rate-limit gate. Run: python test_odds.py"""
import json, os, time, app

# fresh cache + no key -> must reuse cache, never call the API
json.dump({"Brazil": 3.0}, open(app.ODDS_CACHE, "w"))
os.environ.pop("ODDS_API_KEY", None)
assert app.load_odds() == {"Brazil": 3.0}, "fresh cache should be reused"

# stale cache + no key -> still reuse cache (can't fetch without key)
old = time.time() - app.ODDS_TTL - 10
os.utime(app.ODDS_CACHE, (old, old))
assert app.load_odds() == {"Brazil": 3.0}, "no key -> keep last cache"

os.remove(app.ODDS_CACHE)
assert app.load_odds() == app.DEMO_ODDS, "no key/cache -> use demo odds"
print("ok")
