# World Cup Betting Spend  Live Dashboard
get the API KEY HERE https://the-odds-api.com/#get-access
Flask + Socket.IO + SQLite + React. Logged-in users place mock bets; everyone
connected sees the total spend and per-team breakdown update **live** over a
websocket. Team odds are a static list (no external API).

## Stack

| Part | Tech | File |
|------|------|------|
| Backend / API / websocket | Flask + Flask-SocketIO | `app.py` |
| Auth | `werkzeug.security` (salted pbkdf2 hashing) | `app.py` |
| Database | SQLite via SQLAlchemy ORM (`User`, `Bet` models) | `app.py` / `app.db` |
| Front end | React + Vite + `socket.io-client` | `frontend/` |

## Prerequisites

- Python 3.9+
- Node 18+ (`node` and `npm`)

## Setup & run

### 1. Backend

```bash
cd betting-dashboard
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 2. Front end

```bash
cd frontend
npm install
```

Then pick **one** of the two workflows below.

### Option A — Production / demo (one server)

Build React once; Flask serves it and the API on a single port.

```bash
cd frontend
npm run build           # outputs to frontend/dist/

cd ..
PORT=5057 python app.py
```

Open **http://localhost:5057**.

> macOS note: port 5000 is taken by AirPlay Receiver, so set `PORT` to
> something free (e.g. 5057). On other machines `python app.py` defaults to 5000.

### Option B — Development (hot reload)

Two terminals. Vite proxies `/api` and the websocket to Flask.

```bash
# terminal 1 — backend
PORT=5057 python app.py

# terminal 2 — frontend
cd frontend
npm run dev             # http://localhost:5173
```

Open **http://localhost:5173**.

## Using it

1. There are **no default credentials.** Click **Sign up** and create an account
   (username + password; the password is salted and hashed).
2. Place a mock bet on any team.
3. Open a second browser/tab, sign up as another user, place a bet — both tabs
   update live as bets come in.

## Project layout

```
app.py              Flask: SQLAlchemy models, auth, /api/bet, websocket, serves built React
requirements.txt
app.db              SQLite, auto-created by db.create_all() (gitignored)
frontend/
  package.json
  vite.config.js    dev proxy -> Flask
  index.html
  src/main.jsx
  src/App.jsx       login/signup, bet form, live spend bars
```

## Notes

- `app.secret_key` falls back to a dev value; set `SECRET_KEY` in the
  environment for real deployment.
- Odds are a static dict in `app.py`; swap in a live odds API later if desired.
