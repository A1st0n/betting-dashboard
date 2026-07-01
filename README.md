# World Cup Betting Spend: Live Dashboard

Flask + Socket.IO + SQLite + React. Users sign up, top up a **mock wallet**, and
place mock bets on teams or player props. Each user sees **their own** spend and
history; a global **bettor leaderboard** and live scores update over a websocket.

Odds and live scores come from the [World Cup 2026 API](https://github.com/rezarahiminia/worldcup2026)
(worldcup26.ir); player stats and props are derived from match scorers and group standings.
Data is cached to disk and refreshed every **2 minutes** by default (`WC_CACHE_TTL`).
No token? Public read endpoints work without auth.

## Features

- **Auth**: login page with a separate sign-up modal; salted pbkdf2 hashing.
- **Mock wallet**: deposit funds; bets are blocked unless you have the balance.
- **Per-user history**: spend/history is scoped to the logged-in user (socket rooms).
- **Games**: live, upcoming, and finals from the last 3 days ([worldcup26.ir](https://worldcup26.ir/get/games)).
- **Odds**: decimal lines derived from group-stage points (shorter odds for higher-ranked teams).
- **Player stats**: goal scorers plus team goals/points from group standings.
- **Player props**: anytime goalscorer odds from scorer rates (Poisson).
- **Bettor leaderboard**: ranks users by mock money wagered; click a user for a detail modal.

## Stack

| Part | Tech | File |
|------|------|------|
| Backend / API / websocket | Flask + Flask-SocketIO | `app.py` |
| Stat/prop derivation (pure, self-checking) | plain Python | `props.py` |
| Auth | `werkzeug.security` (salted pbkdf2) | `app.py` |
| Database | SQLite via SQLAlchemy (`User`, `Bet`) | `app.py` / `app.db` |
| Front end | React + Vite + `socket.io-client` | `frontend/src/App.jsx`, `frontend/src/extras.jsx` |

## Prerequisites

- Python 3.9+
- Node 18+ (`node` and `npm`)

## Setup

Run these from the project root (no `cd` needed):

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
npm --prefix frontend install
```

Optional: put settings in `.env` (gitignored, auto-loaded):

```
SECRET_KEY=any-long-random-string
WC_API_URL=https://worldcup26.ir
WC_API_TOKEN=your-jwt-if-required
WC_CACHE_TTL=120
```

## Start

### Option A: one server (demo)

Flask serves the built React and the API on one port.

```bash
npm --prefix frontend run build
PORT=5057 python app.py        # open http://localhost:5057
```

> macOS: port 5000 is taken by AirPlay Receiver, use a free `PORT` (e.g. 5057).

### Option B: dev (hot reload)

```bash
PORT=5057 python app.py        # terminal 1: backend
npm --prefix frontend run dev  # terminal 2: http://localhost:5173 (proxies /api → Flask)
```

## Using it

1. No default credentials, click **Sign up**, create an account.
2. Click the **wallet** pill → **Add funds**.
3. Place a bet on a team or a player prop. Open a second tab, sign up as another
   user; the leaderboard updates live for everyone.

## Deploy to Railway

`frontend/dist` is committed so Railway's Python build serves it without Node.

1. Push to GitHub, then Railway → **Deploy from GitHub repo** (auto-detects Python + `Procfile`).
2. Set variables: `SECRET_KEY` (`.env` isn't pushed).
3. **Settings → Networking → Generate Domain**.

SQLite is ephemeral on Railway (resets each redeploy). For persistence, add a
Volume and set `APP_DB=/data/app.db` (the app already reads `APP_DB`).
After frontend changes, rebuild and recommit `frontend/dist`.

## Self-check

```bash
python props.py    # asserts prop-odds ordering + leaderboard reductions
```

## Notes

- `SECRET_KEY` falls back to a dev value; set it in the environment for real deploys.
- API responses cache to `wc_cache.json` (gitignored); delete it to force a refetch.
- Prop odds are trusted from the client for **mock** money only; recompute
  server-side before settling anything real.
