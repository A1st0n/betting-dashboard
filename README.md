# World Cup Betting Spend — Live Dashboard

Flask + SocketIO + SQLite + React. Logged-in users place mock bets; everyone
sees total spend per team update live. Real odds from the-odds-api when a key
is set, synthetic otherwise.

## Run

```bash
# backend
pip install -r requirements.txt
python app.py                 # http://localhost:5000

# frontend (separate terminal, for development with hot reload)
cd frontend
npm install
npm run dev                   # http://localhost:5173, proxies to Flask

# for the demo: build once, Flask serves it on :5000
npm run build
```

Optional real odds: `export ODDS_API_KEY=...` (free at the-odds-api.com) before `python app.py`.

## Stack
- **app.py** — API (signup/login with werkzeug salted hashing), websocket, odds poller, serves built React
- **frontend/** — Vite React, `socket.io-client`
- **app.db** — SQLite (auto-created)
