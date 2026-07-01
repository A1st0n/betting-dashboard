"""Derivations from World Cup 2026 match data: leaderboards + betting props.
No Flask/DB here so it stays trivially testable. Run `python props.py` to self-check."""
import math
import re

# Leaderboards built from API games + group standings
LEADERBOARDS = [
    ("Goals", "goals"),
    ("Team goals", "team_gf"),
    ("Group points", "team_pts"),
]

PROP_MARKETS = [
    ("Anytime goalscorer", "goals"),
]


def parse_scorers(raw):
    """Parse scorer strings like {\"Player 27'\",\"Other 75' (p)\"}."""
    if not raw or raw == "null":
        return []
    out = []
    for chunk in re.findall(r'"([^"]+)"', raw):
        name = re.sub(r"\s+\d+'.*$", "", chunk).strip()
        if name:
            out.append(name)
    return out


def _player_goals(games):
    """Tally goals per player from finished matches."""
    tallies = {}
    for g in games:
        if (g.get("finished") or "").upper() != "TRUE":
            continue
        pairs = (
            (g.get("home_team_name_en") or g.get("home_team_label"), g.get("home_scorers")),
            (g.get("away_team_name_en") or g.get("away_team_label"), g.get("away_scorers")),
        )
        for team, scorers in pairs:
            if not team:
                continue
            for player in parse_scorers(scorers):
                row = tallies.setdefault(player, {"player": player, "team": team, "value": 0})
                row["team"] = team
                row["value"] += 1
    return list(tallies.values())


def _team_rows(groups, teams):
    """Group standings keyed by English team name."""
    by_id = {t["id"]: t["name_en"] for t in teams}
    rows = []
    for grp in groups.get("groups", groups if isinstance(groups, list) else []):
        for row in grp.get("teams", []):
            name = by_id.get(row.get("team_id"), row.get("team_id"))
            if not name:
                continue
            rows.append({
                "player": name,
                "team": f"Group {grp.get('name', '?')}",
                "team_pts": int(row.get("pts") or 0),
                "team_gf": int(row.get("gf") or 0),
            })
    return rows


def build_stats(games, groups, teams):
    """Games + standings -> top-10 leaderboards for the dashboard."""
    goals = sorted(_player_goals(games), key=lambda r: r["value"], reverse=True)[:10]
    team_rows = _team_rows(groups, teams)
    by_gf = sorted(team_rows, key=lambda r: r["team_gf"], reverse=True)[:10]
    by_pts = sorted(team_rows, key=lambda r: r["team_pts"], reverse=True)[:10]
    out = {}
    if goals:
        out["Goals"] = [{"player": r["player"], "team": r["team"], "value": r["value"]} for r in goals]
    if by_gf:
        out["Team goals"] = [{"player": r["player"], "team": r["team"], "value": r["team_gf"]} for r in by_gf]
    if by_pts:
        out["Group points"] = [{"player": r["player"], "team": r["team"], "value": r["team_pts"]} for r in by_pts]
    return out


def _odds(p):
    """Decimal odds from a probability, clamped so demo lines stay sane."""
    return round(1 / min(max(p, 0.02), 0.95), 2)


def _team_mp(groups, teams):
    mp = {}
    by_id = {t["id"]: t["name_en"] for t in teams}
    for grp in groups.get("groups", groups if isinstance(groups, list) else []):
        for row in grp.get("teams", []):
            name = by_id.get(row.get("team_id"))
            if name:
                mp[name] = int(row.get("mp") or 0)
    return mp


def build_props(games, groups, teams, n=15):
    """Anytime goalscorer props from goals-per-match rates (Poisson)."""
    mp = _team_mp(groups, teams)
    rows = []
    for r in _player_goals(games):
        apps = max(mp.get(r["team"], 0), 1)
        val = r["value"]
        if val:
            p = 1 - math.exp(-(val / apps))
            rows.append({
                "player": r["player"],
                "team": r["team"],
                "prob": round(p, 3),
                "odds": _odds(p),
            })
    rows.sort(key=lambda x: x["prob"], reverse=True)
    return {"Anytime goalscorer": rows[:n]} if rows else {}


if __name__ == "__main__":
    games = [
        {"id": "1", "finished": "TRUE",
         "home_team_name_en": "Brazil", "away_team_name_en": "Serbia",
         "home_scorers": '{"A 12\'","A 80\'"}', "away_scorers": "null"},
        {"id": "2", "finished": "TRUE",
         "home_team_name_en": "France", "away_team_name_en": "Peru",
         "home_scorers": '{"B 55\'"}', "away_scorers": "null"},
    ]
    teams = [{"id": "1", "name_en": "Brazil"}, {"id": "2", "name_en": "Serbia"},
             {"id": "3", "name_en": "France"}, {"id": "4", "name_en": "Peru"}]
    groups = {"groups": [{"name": "A", "teams": [
        {"team_id": "1", "pts": "6", "gf": "3", "mp": "2"},
        {"team_id": "2", "pts": "3", "gf": "1", "mp": "2"},
    ]}, {"name": "B", "teams": [
        {"team_id": "3", "pts": "6", "gf": "2", "mp": "2"},
        {"team_id": "4", "pts": "0", "gf": "0", "mp": "2"},
    ]}]}
    stats = build_stats(games, groups, teams)
    props = build_props(games, groups, teams)["Anytime goalscorer"]
    assert stats["Goals"][0]["player"] == "A", stats
    assert props[0]["player"] == "A" and props[0]["odds"] <= props[1]["odds"], props
    print("ok")
