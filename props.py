"""Pure derivations off the Opta player-stats feed: leaderboards + betting props.
No Flask/DB here so it stays trivially testable. Run `python props.py` to self-check."""
import math

# (label, category, group, stat key) — leaderboards the dashboard shows
LEADERBOARDS = [
    ("Goals", "attack", "overall", "goals"),
    ("Expected goals (xG)", "attack", "overall", "xg"),
    ("Assists", "possession", "chanceCreation", "assists"),
    ("Chances created", "possession", "chanceCreation", "chances_created"),
    ("Tackles", "defending", "overall", "tackles"),
    ("Save %", "goalkeeping", "overall", "save_perc"),
]

# (market label, category, group, per-app count stat) — props derived from rates
PROP_MARKETS = [
    ("Anytime goalscorer", "attack", "overall", "goals"),
    ("Anytime assist", "possession", "chanceCreation", "assists"),
]


def _name(r):
    return {"player": r.get("player"),
            "team": r.get("contestantName") or r.get("contestantCode")}


def _top(rows, stat, n=10):
    out = [{**_name(r), "value": r[stat]} for r in rows if r.get(stat) not in (None, "")]
    out.sort(key=lambda x: float(x["value"]), reverse=True)
    return out[:n]


def build_stats(data):
    """5 MB Opta dump -> a handful of top-10 leaderboards small enough to push."""
    return {label: _top(data.get(cat, {}).get(grp, []), stat)
            for label, cat, grp, stat in LEADERBOARDS if data.get(cat, {}).get(grp)}


def _odds(p):
    """Decimal odds from a probability, clamped so demo lines stay sane."""
    return round(1 / min(max(p, 0.02), 0.95), 2)


def build_props(data, n=15):
    """Per-90-style props: P(1+ event) via Poisson on the player's per-app rate."""
    out = {}
    for label, cat, grp, stat in PROP_MARKETS:
        rows = []
        for r in data.get(cat, {}).get(grp, []):
            apps, val = r.get("apps") or 0, r.get(stat) or 0
            if apps and val:
                p = 1 - math.exp(-(val / apps))  # anytime = 1 - P(zero)
                rows.append({**_name(r), "prob": round(p, 3), "odds": _odds(p)})
        rows.sort(key=lambda x: x["prob"], reverse=True)
        if rows:
            out[label] = rows[:n]
    return out


if __name__ == "__main__":
    data = {"attack": {"overall": [
        {"player": "A", "contestantName": "X", "apps": 7, "goals": 6},
        {"player": "B", "contestantName": "Y", "apps": 5, "goals": 1},
        {"player": "C", "contestantName": "Z", "apps": 0, "goals": 3},  # no apps -> no prop
    ]}}
    props = build_props(data)["Anytime goalscorer"]
    assert [r["player"] for r in props] == ["A", "B"], props  # C dropped, sorted by prob
    assert props[0]["odds"] < props[1]["odds"], "higher prob -> shorter odds"
    assert build_stats(data)["Goals"][0]["player"] == "A", "top scorer first"
    print("ok")
