import React, { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  BadgeDollarSign,
  BarChart3,
  CircleDollarSign,
  LogIn,
  LogOut,
  Plus,
  Trophy,
  User,
  UserPlus,
  Wallet,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { io } from "socket.io-client";
import { PropsPanel, LeaderboardPanel } from "./extras.jsx";
import SoftAurora from "./SoftAurora.jsx";
import TrueFocus from "./TrueFocus.jsx";
import Dock from "./Dock.jsx";
import { flag } from "./flags.js";
import Crest from "./Crest.jsx";

const socket = io(); // same origin; dev proxy forwards to Flask

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

async function api(path, body) {
  const r = await fetch("/api" + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "request failed");
  return data;
}

export default function App() {
  const [user, setUser] = useState(undefined);
  const [balance, setBalance] = useState(0);
  const [odds, setOdds] = useState({});
  const [games, setGames] = useState([]);
  const [stats, setStats] = useState({});
  const [props, setProps] = useState({});
  const [board, setBoard] = useState([]);
  const [agg, setAgg] = useState({ total: 0, by_team: [] });
  const [connected, setConnected] = useState(socket.connected);
  const [showWelcome, setShowWelcome] = useState(false);

  useEffect(() => {
    let active = true;

    fetch("/api/me")
      .then((r) => r.json())
      .then((d) => {
        if (!active) return;
        setUser(d.username);
        setBalance(Number(d.balance || 0));
      })
      .catch(() => active && setUser(null));

    const handleOdds = (data) => setOdds(data || {});
    const handleGames = (data) => setGames(data || []);
    const handleStats = (data) => setStats(data || {});
    const handleProps = (data) => setProps(data || {});
    const handleBoard = (data) => setBoard(data || []);
    const handleWallet = (data) => setBalance(Number(data?.balance || 0));
    const handleAggregates = (data) =>
      setAgg(data || { total: 0, by_team: [] });
    const handleConnect = () => setConnected(true);
    const handleDisconnect = () => setConnected(false);

    socket.on("odds", handleOdds);
    socket.on("games", handleGames);
    socket.on("player_stats", handleStats);
    socket.on("props", handleProps);
    socket.on("leaderboard", handleBoard);
    socket.on("wallet", handleWallet);
    socket.on("aggregates", handleAggregates);
    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);

    return () => {
      active = false;
      socket.off("odds", handleOdds);
      socket.off("games", handleGames);
      socket.off("player_stats", handleStats);
      socket.off("props", handleProps);
      socket.off("leaderboard", handleBoard);
      socket.off("wallet", handleWallet);
      socket.off("aggregates", handleAggregates);
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
    };
  }, []);

  // re-handshake when login state changes so the server sees the right user's cookie
  useEffect(() => {
    if (user === undefined) return;
    socket.disconnect();
    socket.connect();
  }, [user]);

  let content;
  if (user === undefined) {
    content = <LoadingScreen />;
  } else if (!user) {
    content = (
      <Auth
        onAuth={(name, bal) => {
          setUser(name);
          setBalance(Number(bal || 0));
          setShowWelcome(true);
        }}
      />
    );
  } else if (showWelcome) {
    content = <Welcome onDone={() => setShowWelcome(false)} />;
  } else {
    content = (
      <Dashboard
        agg={agg}
        balance={balance}
        connected={connected}
        board={board}
        games={games}
        odds={odds}
        props={props}
        stats={stats}
        user={user}
        onBalance={setBalance}
        onLogout={() => setUser(null)}
      />
    );
  }

  return (
    <>
      <SoftAurora />
      {content}
    </>
  );
}

function Welcome({ onDone }) {
  return (
    <main className="auth-shell">
      <section className="auth-panel welcome-panel">
        <TrueFocus
          sentence="Welcome to Bets.app: An interactive accelerator to hone your intuition"
          borderColor="#6366f1"
          interval={900}
        />
        <button className="primary-button" onClick={onDone} type="button">
          Enter
        </button>
      </section>
    </main>
  );
}

function Dashboard({ agg, balance, board, connected, games, odds, props, stats, user, onBalance, onLogout }) {
  const [showDeposit, setShowDeposit] = useState(false);
  const [detail, setDetail] = useState(null);
  const [account, setAccount] = useState(null);
  const [view, setView] = useState("Games");

  async function openAccount() {
    try {
      const r = await fetch("/api/mybets");
      const data = await r.json();
      setAccount(r.ok ? data : { balance: 0, bets: [], error: data.error });
    } catch {
      setAccount({ balance: 0, bets: [], error: "could not load account" });
    }
  }

  async function placeBet(payload) {
    const data = await api("/bet", payload);
    onBalance(Number(data.balance || 0));
  }

  async function openUser(name) {
    const r = await fetch("/api/user/" + encodeURIComponent(name));
    setDetail(await r.json());
  }
  const oddsRows = useMemo(() => {
    const rows = Object.entries(odds)
      .map(([team, price]) => ({
        team,
        price: Number(price),
        implied: 1 / Number(price),
      }))
      .filter((row) => Number.isFinite(row.price) && row.price > 0);

    const totalImplied = rows.reduce((sum, row) => sum + row.implied, 0) || 1;

    return rows
      .map((row) => ({
        ...row,
        chance: (row.implied / totalImplied) * 100,
      }))
      .sort((a, b) => b.chance - a.chance);
  }, [odds]);

  const spendRows = useMemo(
    () =>
      (agg.by_team || []).map((row) => ({
        team: row.team,
        spent: Number(row.spent || 0),
        bets: row.n,
      })),
    [agg.by_team]
  );

  const topTeam = spendRows[0]?.team || "No bets yet";
  const totalBets = spendRows.reduce((sum, row) => sum + Number(row.bets || 0), 0);

  async function handleLogout(event) {
    event.preventDefault();
    await api("/logout");
    onLogout();
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">
            <Trophy size={24} aria-hidden="true" />
          </span>
          <div>
            <h1>World Cup Betting Spend</h1>
            <p>Live mock wagers by team</p>
          </div>
        </div>

        <div className="topbar-actions">
          <span className={connected ? "status-pill is-live" : "status-pill"}>
            {connected ? (
              <Wifi size={16} aria-hidden="true" />
            ) : (
              <WifiOff size={16} aria-hidden="true" />
            )}
            {connected ? "Live" : "Reconnecting"}
          </span>
          <button
            className="wallet-pill"
            onClick={() => setShowDeposit(true)}
            title="Add funds"
            type="button"
          >
            <Wallet size={16} aria-hidden="true" />
            {money.format(balance)}
            <Plus size={14} aria-hidden="true" />
          </button>
          <button
            className="user-pill"
            onClick={openAccount}
            title="View your account"
            type="button"
          >
            <User size={16} aria-hidden="true" />
            {user}
          </button>
          <button
            className="icon-button"
            onClick={handleLogout}
            title="Log out"
            type="button"
          >
            <LogOut size={18} aria-hidden="true" />
          </button>
        </div>
      </header>

      <section className="stat-grid" aria-label="Dashboard summary">
        <StatCard
          icon={<BadgeDollarSign size={20} aria-hidden="true" />}
          label="Total wagered"
          value={money.format(Number(agg.total || 0))}
        />
        <StatCard
          icon={<BarChart3 size={20} aria-hidden="true" />}
          label="Teams with bets"
          value={spendRows.length.toLocaleString()}
        />
        <StatCard
          icon={<CircleDollarSign size={20} aria-hidden="true" />}
          label="Total bets"
          value={totalBets.toLocaleString()}
        />
        <StatCard
          icon={<Trophy size={20} aria-hidden="true" />}
          label="Top team"
          value={topTeam}
        />
      </section>

      <main className="dashboard-grid">
        {view === "Games" && (
          <section className="panel wide-panel">
            <PanelHeader
              eyebrow="Live, upcoming & finished in the last 3 days"
              icon={<Trophy size={18} aria-hidden="true" />}
              title="Games"
            />
            <GamesPanel games={games} />
          </section>
        )}

        {view === "Bet" && (
          <>
            <section className="panel bet-panel">
              <PanelHeader
                eyebrow={`${oddsRows.length} markets`}
                icon={<CircleDollarSign size={18} aria-hidden="true" />}
                title="Place a mock bet"
              />
              {balance <= 0 && (
                <EmptyState message="Add funds to your wallet before placing a bet." />
              )}
              {oddsRows.length === 0 ? (
                <EmptyState message="No odds loaded yet. Check the API key or odds cache." />
              ) : (
                <div className="bet-list">
                  {oddsRows.map((row) => (
                    <BetRow
                      key={row.team}
                      row={row}
                      balance={balance}
                      onBalance={onBalance}
                    />
                  ))}
                </div>
              )}
            </section>

            <section className="panel">
              <PanelHeader
                eyebrow="Normalized from decimal odds"
                icon={<BarChart3 size={18} aria-hidden="true" />}
                title="Implied win chance"
              />
              <OddsList rows={oddsRows} />
            </section>

            <section className="panel wide-panel">
              <PanelHeader
                eyebrow="Updates after every mock bet"
                icon={<BadgeDollarSign size={18} aria-hidden="true" />}
                title="Spend by team"
              />
              <SpendChart rows={spendRows} />
            </section>
          </>
        )}

        {view === "Stats" && (
          <section className="panel wide-panel">
            <PanelHeader
              eyebrow="Player leaderboards · Opta via theanalyst.com"
              icon={<BarChart3 size={18} aria-hidden="true" />}
              title="Player stats"
            />
            <StatsPanel stats={stats} />
          </section>
        )}

        {view === "Props" && (
          <section className="panel bet-panel">
            <PanelHeader
              eyebrow="Derived from Opta rates · $10 mock stake"
              icon={<CircleDollarSign size={18} aria-hidden="true" />}
              title="Player props"
            />
            <PropsPanel props={props} balance={balance} onBet={placeBet} />
          </section>
        )}

        {view === "Leaderboard" && (
          <section className="panel">
            <PanelHeader
              eyebrow="Most mock money wagered"
              icon={<Trophy size={18} aria-hidden="true" />}
              title="Bettor leaderboard"
            />
            <LeaderboardPanel rows={board} me={user} onSelect={openUser} />
          </section>
        )}
      </main>

      {showDeposit && (
        <DepositModal
          onClose={() => setShowDeposit(false)}
          onBalance={onBalance}
        />
      )}

      {detail && (
        <Modal onClose={() => setDetail(null)} title={detail.user}>
          <div className="user-detail">
            <div className="user-detail-stats">
              <span>
                <p>Wagered</p>
                <strong>{money.format(Number(detail.wagered || 0))}</strong>
              </span>
              <span>
                <p>Bets</p>
                <strong>{detail.bets}</strong>
              </span>
            </div>
            {(detail.by_team || []).length === 0 ? (
              <EmptyState message="No bets placed yet." />
            ) : (
              <div className="odds-list">
                {detail.by_team.map((t) => (
                  <div className="metric-row" key={t.team}>
                    <div className="metric-label">
                      <span>{t.team}</span>
                      <strong>{money.format(Number(t.spent || 0))}</strong>
                    </div>
                    <span className="row-message">{t.n} bets</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Modal>
      )}

      {account && (
        <Modal onClose={() => setAccount(null)} title={`${user} · account`}>
          <div className="user-detail">
            <div className="user-detail-stats">
              <span>
                <p>Balance</p>
                <strong>{money.format(Number(account.balance || 0))}</strong>
              </span>
              <span>
                <p>Record (W-L)</p>
                <strong>
                  {(account.bets || []).filter((b) => b.status === "won").length}
                  {"-"}
                  {(account.bets || []).filter((b) => b.status === "lost").length}
                </strong>
              </span>
            </div>

            {!account.bets || account.bets.length === 0 ? (
              <EmptyState message="No bets yet. Place one to start your history." />
            ) : (
              <div className="bethist">
                {account.bets.map((b, i) => (
                  <div className="bethist-row" key={i}>
                    <span className="bethist-pick">{b.team}</span>
                    <span className="bethist-stake">
                      {money.format(b.amount)} @ {b.odds}
                    </span>
                    <span className={`bethist-status is-${b.status}`}>
                      {b.status === "won"
                        ? `+${money.format(b.payout)}`
                        : b.status === "void"
                        ? "refund"
                        : b.status}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="account-actions">
              <button
                className="primary-button"
                onClick={() => {
                  setAccount(null);
                  setShowDeposit(true);
                }}
                type="button"
              >
                <Wallet size={16} aria-hidden="true" />
                Add funds
              </button>
              <button className="secondary-button" onClick={handleLogout} type="button">
                <LogOut size={16} aria-hidden="true" />
                Log out
              </button>
            </div>
          </div>
        </Modal>
      )}

      <Dock
        active={view}
        items={[
          { label: "Games", icon: <Trophy size={20} /> },
          { label: "Bet", icon: <CircleDollarSign size={20} /> },
          { label: "Stats", icon: <BarChart3 size={20} /> },
          { label: "Props", icon: <BadgeDollarSign size={20} /> },
          { label: "Leaderboard", icon: <Trophy size={20} /> },
        ].map((it) => ({
          ...it,
          onClick: () => {
            setView(it.label);
            window.scrollTo({ top: 0 });
          },
        }))}
      />
    </div>
  );
}

function DepositModal({ onClose, onBalance }) {
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const value = Number(amount);

  async function submit(event) {
    event.preventDefault();
    if (!(value > 0)) return;
    setPending(true);
    setError("");
    try {
      const data = await api("/deposit", { amount: value });
      onBalance(Number(data.balance || 0));
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal onClose={onClose} title="Add mock funds">
      <form onSubmit={submit}>
        <label>
          Amount
          <input
            autoFocus
            min="1"
            onChange={(event) => setAmount(event.target.value)}
            placeholder="$100"
            type="number"
            value={amount}
          />
        </label>
        {error && (
          <p className="form-error">
            <AlertCircle size={16} aria-hidden="true" />
            {error}
          </p>
        )}
        <button
          className="primary-button"
          disabled={pending || !(value > 0)}
          type="submit"
        >
          <Wallet size={16} aria-hidden="true" />
          {pending ? "Adding" : "Add funds"}
        </button>
      </form>
    </Modal>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-header">
          <h2>{title}</h2>
          <button
            className="icon-button"
            onClick={onClose}
            title="Close"
            type="button"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const kickoff = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  hour: "numeric",
  minute: "2-digit",
});

function StatsPanel({ stats }) {
  const boards = Object.keys(stats);
  const [board, setBoard] = useState(boards[0]);
  const active = board && stats[board] ? board : boards[0];
  const rows = (active && stats[active]) || [];

  if (!boards.length) {
    return <EmptyState message="Player stats load once the feed is fetched." />;
  }

  return (
    <div className="stats-wrap">
      <select
        aria-label="Stat leaderboard"
        className="stats-select"
        onChange={(event) => setBoard(event.target.value)}
        value={active}
      >
        {boards.map((b) => (
          <option key={b} value={b}>
            {b}
          </option>
        ))}
      </select>
      <ol className="stats-list">
        {rows.map((r, i) => (
          <li key={`${r.player}-${i}`} title={`#${i + 1} ${r.player} (${r.team}) — ${active}: ${r.value}`}>
            <span className="stats-rank">{i + 1}</span>
            <span className="stats-player">
              <Crest teamId={r.team_id} team={r.team} />
              {r.player}
            </span>
            <span className="stats-team">{r.team}</span>
            <strong className="stats-value">
              {Number.isInteger(Number(r.value))
                ? r.value
                : Number(r.value).toFixed(2)}
            </strong>
          </li>
        ))}
      </ol>
    </div>
  );
}

function GamesPanel({ games }) {
  if (!games.length) {
    return <EmptyState message="No live, upcoming, or recent games right now." />;
  }
  return (
    <div className="games-list">
      {games.map((g) => (
        <div
          className="game-row"
          key={g.id}
          title={`${g.home} vs ${g.away} — ${g.status} — kickoff ${kickoff.format(
            new Date(g.commence_time)
          )}`}
        >
          <span className={`game-status is-${g.status}`}>{g.status}</span>
          <strong className="game-team">{flag(g.home)} {g.home}</strong>
          <span className="game-center">
            {g.status === "upcoming"
              ? kickoff.format(new Date(g.commence_time))
              : `${g.home_score ?? "–"} : ${g.away_score ?? "–"}`}
          </span>
          <strong className="game-team game-away">{g.away} {flag(g.away)}</strong>
        </div>
      ))}
    </div>
  );
}

function StatCard({ icon, label, value }) {
  return (
    <article className="stat-card" title={`${label}: ${value}`}>
      <span className="stat-icon">{icon}</span>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
      </div>
    </article>
  );
}

function PanelHeader({ eyebrow, icon, title }) {
  return (
    <div className="panel-header">
      <div>
        <h2>{title}</h2>
        <p>{eyebrow}</p>
      </div>
      <span className="panel-icon">{icon}</span>
    </div>
  );
}

function BetRow({ row, balance, onBalance }) {
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const amountValue = Number(amount);
  const enoughFunds = amountValue <= balance;
  const canSubmit =
    Number.isFinite(amountValue) && amountValue > 0 && enoughFunds && !pending;

  async function handleSubmit(event) {
    event.preventDefault();
    if (!canSubmit) return;

    setPending(true);
    setMessage("");

    try {
      const data = await api("/bet", {
        team: row.team,
        match: "World Cup",
        amount: amountValue,
      });
      setAmount("");
      setMessage("Bet placed");
      onBalance(Number(data.balance || 0));
    } catch (error) {
      setMessage(error.message);
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="bet-row" onSubmit={handleSubmit}>
      <div className="team-meta">
        <strong>{row.team}</strong>
        <span>@ {row.price}</span>
      </div>
      <input
        aria-label={`Bet amount for ${row.team}`}
        min="1"
        onChange={(event) => setAmount(event.target.value)}
        placeholder="$"
        type="number"
        value={amount}
      />
      <button className="primary-button" disabled={!canSubmit} type="submit">
        <CircleDollarSign size={16} aria-hidden="true" />
        {pending ? "Placing" : "Bet"}
      </button>
      {amountValue > 0 && !enoughFunds && (
        <span className="row-message">Not enough funds</span>
      )}
      {message && <span className="row-message">{message}</span>}
    </form>
  );
}

function OddsList({ rows }) {
  if (rows.length === 0) {
    return <EmptyState message="Odds will appear here once the server sends them." />;
  }

  return (
    <div className="odds-list">
      {rows.map((row) => (
        <div className="metric-row" key={row.team}>
          <div className="metric-label">
            <span>{row.team}</span>
            <strong>{row.chance.toFixed(1)}%</strong>
          </div>
          <div className="meter" aria-hidden="true">
            <span style={{ width: `${Math.max(row.chance, 2)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function SpendChart({ rows }) {
  if (rows.length === 0) {
    return <EmptyState message="No bets yet. Place one to start the live chart." />;
  }

  const chartRows = rows.slice(0, 8);
  const max = Math.max(...chartRows.map((r) => r.spent), 1);

  // ponytail: plain CSS bars  drops the ~570KB recharts dep, same horizontal bar look
  return (
    <div className="spend-chart">
      {chartRows.map((r) => (
        <div className="spend-row" key={r.team} title={`${r.team}: ${money.format(r.spent)}`}>
          <span className="spend-team">{r.team}</span>
          <span className="spend-track">
            <span className="spend-bar" style={{ width: `${(r.spent / max) * 100}%` }} />
          </span>
          <span className="spend-val">{money.format(r.spent)}</span>
        </div>
      ))}
    </div>
  );
}

function Auth({ onAuth }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [showSignup, setShowSignup] = useState(false);

  async function login(event) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const data = await api("/login", { username, password });
      onAuth(data.username, data.balance);
    } catch (err) {
      setError(err.message);
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="auth-shell">
      <form className="auth-panel" onSubmit={login}>
        <span className="brand-mark auth-mark">
          <Trophy size={24} aria-hidden="true" />
        </span>
        <h1>World Cup Betting Spend</h1>
        <p>Log in to place mock bets.</p>

        <label>
          Username
          <input
            autoComplete="username"
            onChange={(event) => setUsername(event.target.value)}
            placeholder="esosa"
            value={username}
          />
        </label>
        <label>
          Password
          <input
            autoComplete="current-password"
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Enter password"
            type="password"
            value={password}
          />
        </label>

        {error && (
          <p className="form-error">
            <AlertCircle size={16} aria-hidden="true" />
            {error}
          </p>
        )}

        <div className="auth-actions">
          <button className="primary-button" disabled={pending} type="submit">
            <LogIn size={16} aria-hidden="true" />
            Log in
          </button>
          <button
            className="secondary-button"
            disabled={pending}
            onClick={() => setShowSignup(true)}
            type="button"
          >
            <UserPlus size={16} aria-hidden="true" />
            Sign up
          </button>
        </div>
      </form>

      {showSignup && (
        <SignupModal onAuth={onAuth} onClose={() => setShowSignup(false)} />
      )}
    </main>
  );
}

function SignupModal({ onAuth, onClose }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event) {
    event.preventDefault();
    if (password !== confirm) {
      setError("passwords do not match");
      return;
    }
    setPending(true);
    setError("");
    try {
      const data = await api("/signup", { username, password });
      onAuth(data.username, data.balance);
    } catch (err) {
      setError(err.message);
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal onClose={onClose} title="Create your account">
      <form onSubmit={submit}>
        <label>
          Username
          <input
            autoComplete="username"
            autoFocus
            onChange={(event) => setUsername(event.target.value)}
            placeholder="esosa"
            value={username}
          />
        </label>
        <label>
          Password
          <input
            autoComplete="new-password"
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Choose a password"
            type="password"
            value={password}
          />
        </label>
        <label>
          Confirm password
          <input
            autoComplete="new-password"
            onChange={(event) => setConfirm(event.target.value)}
            placeholder="Repeat password"
            type="password"
            value={confirm}
          />
        </label>
        {error && (
          <p className="form-error">
            <AlertCircle size={16} aria-hidden="true" />
            {error}
          </p>
        )}
        <button
          className="primary-button"
          disabled={pending || !username || !password}
          type="submit"
        >
          <UserPlus size={16} aria-hidden="true" />
          {pending ? "Creating" : "Create account"}
        </button>
      </form>
    </Modal>
  );
}

function LoadingScreen() {
  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <span className="brand-mark auth-mark">
          <Trophy size={24} aria-hidden="true" />
        </span>
        <h1>Loading dashboard</h1>
      </section>
    </main>
  );
}

function EmptyState({ message }) {
  return (
    <div className="empty-state">
      <AlertCircle size={18} aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}
