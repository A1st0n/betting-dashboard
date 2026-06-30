import React, { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  BadgeDollarSign,
  BarChart3,
  CircleDollarSign,
  LogIn,
  LogOut,
  Trophy,
  User,
  UserPlus,
  Wifi,
  WifiOff,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { io } from "socket.io-client";

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
  const [odds, setOdds] = useState({});
  const [agg, setAgg] = useState({ total: 0, by_team: [] });
  const [connected, setConnected] = useState(socket.connected);

  useEffect(() => {
    let active = true;

    fetch("/api/me")
      .then((r) => r.json())
      .then((d) => active && setUser(d.username))
      .catch(() => active && setUser(null));

    const handleOdds = (data) => setOdds(data || {});
    const handleAggregates = (data) =>
      setAgg(data || { total: 0, by_team: [] });
    const handleConnect = () => setConnected(true);
    const handleDisconnect = () => setConnected(false);

    socket.on("odds", handleOdds);
    socket.on("aggregates", handleAggregates);
    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);

    return () => {
      active = false;
      socket.off("odds", handleOdds);
      socket.off("aggregates", handleAggregates);
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
    };
  }, []);

  if (user === undefined) return <LoadingScreen />;
  if (!user) return <Auth onAuth={setUser} />;

  return (
    <Dashboard
      agg={agg}
      connected={connected}
      odds={odds}
      user={user}
      onLogout={() => setUser(null)}
    />
  );
}

function Dashboard({ agg, connected, odds, user, onLogout }) {
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
          <span className="user-pill">
            <User size={16} aria-hidden="true" />
            {user}
          </span>
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
        <section className="panel bet-panel">
          <PanelHeader
            eyebrow={`${oddsRows.length} markets`}
            icon={<CircleDollarSign size={18} aria-hidden="true" />}
            title="Place a mock bet"
          />
          {oddsRows.length === 0 ? (
            <EmptyState message="No odds loaded yet. Check the API key or odds cache." />
          ) : (
            <div className="bet-list">
              {oddsRows.map((row) => (
                <BetRow key={row.team} row={row} />
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
      </main>
    </div>
  );
}

function StatCard({ icon, label, value }) {
  return (
    <article className="stat-card">
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

function BetRow({ row }) {
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const amountValue = Number(amount);
  const canSubmit = Number.isFinite(amountValue) && amountValue > 0 && !pending;

  async function handleSubmit(event) {
    event.preventDefault();
    if (!canSubmit) return;

    setPending(true);
    setMessage("");

    try {
      await api("/bet", {
        team: row.team,
        match: "World Cup",
        amount: amountValue,
      });
      setAmount("");
      setMessage("Bet placed");
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

  return (
    <div className="chart-wrap">
      <ResponsiveContainer height={260} width="100%">
        <BarChart
          data={chartRows}
          layout="vertical"
          margin={{ bottom: 8, left: 8, right: 16, top: 8 }}
        >
          <CartesianGrid horizontal={false} stroke="#e5e7eb" />
          <XAxis
            axisLine={false}
            tickFormatter={(value) => money.format(Number(value))}
            tickLine={false}
            type="number"
          />
          <YAxis
            axisLine={false}
            dataKey="team"
            tickLine={false}
            type="category"
            width={110}
          />
          <Tooltip
            cursor={{ fill: "#f1f5f9" }}
            formatter={(value) => [money.format(Number(value)), "Spent"]}
          />
          <Bar dataKey="spent" fill="#2563eb" radius={[0, 6, 6, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function Auth({ onAuth }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(path) {
    setPending(true);
    setError("");

    try {
      const data = await api(path, { username, password });
      onAuth(data.username);
    } catch (err) {
      setError(err.message);
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <span className="brand-mark auth-mark">
          <Trophy size={24} aria-hidden="true" />
        </span>
        <h1>World Cup Betting Spend</h1>
        <p>Sign in or create a local account to place mock bets.</p>

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
          <button
            className="primary-button"
            disabled={pending}
            onClick={() => submit("/login")}
            type="button"
          >
            <LogIn size={16} aria-hidden="true" />
            Log in
          </button>
          <button
            className="secondary-button"
            disabled={pending}
            onClick={() => submit("/signup")}
            type="button"
          >
            <UserPlus size={16} aria-hidden="true" />
            Sign up
          </button>
        </div>
      </section>
    </main>
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
