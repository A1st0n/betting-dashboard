import React, { useEffect, useState } from "react";
import { io } from "socket.io-client";

const socket = io(); // same origin; dev proxy forwards to Flask

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
  const [user, setUser] = useState(null);
  const [odds, setOdds] = useState({});
  const [agg, setAgg] = useState({ total: 0, by_team: [] });

  useEffect(() => {
    fetch("/api/me").then((r) => r.json()).then((d) => setUser(d.username));
    socket.on("odds", setOdds);
    socket.on("aggregates", setAgg);
    return () => socket.off();
  }, []);

  if (!user) return <Auth onAuth={setUser} />;

  return (
    <div style={S.page}>
      <header style={S.header}>
        <h1> World Cup Betting Spend: Live</h1>
        <span>
          {user} ·{" "}
          <a href="#" onClick={() => api("/logout").then(() => setUser(null))}>logout</a>
        </span>
      </header>

      <h2>Total wagered: ${agg.total.toLocaleString()}</h2>

      <div style={S.cols}>
        <section style={S.col}>
          <h3>Place a mock bet</h3>
          {Object.entries(odds).map(([team, price]) => (
            <BetRow key={team} team={team} price={price} />
          ))}
        </section>

        <section style={S.col}>
          <h3>Live odds: implied win chance</h3>
          {Object.keys(odds).length === 0 && <p>No odds yet.</p>}
          {Object.entries(odds)
            .map(([team, price]) => [team, price, 1 / price])
            .sort((a, b) => b[2] - a[2])
            .map(([team, price, impl]) => {
              const sum = Object.values(odds).reduce((s, p) => s + 1 / p, 0) || 1;
              const pct = (impl / sum) * 100;
              return (
                <div key={team} style={{ margin: "8px 0" }}>
                  <div style={S.barLabel}>
                    <span>{team} <small>@ {price}</small></span>
                    <span>{pct.toFixed(1)}%</span>
                  </div>
                  <div style={{ ...S.bar, background: "#16a34a", width: `${pct}%` }} />
                </div>
              );
            })}
        </section>

        <section style={S.col}>
          <h3>Spend by team (everyone, live)</h3>
          {agg.by_team.length === 0 && <p>No bets yet — place one.</p>}
          {agg.by_team.map((t) => {
            const max = agg.by_team[0]?.spent || 1;
            return (
              <div key={t.team} style={{ margin: "8px 0" }}>
                <div style={S.barLabel}>
                  <span>{t.team}</span>
                  <span>${t.spent.toLocaleString()} ({t.n})</span>
                </div>
                <div style={{ ...S.bar, width: `${(t.spent / max) * 100}%` }} />
              </div>
            );
          })}
        </section>
      </div>
    </div>
  );
}

function BetRow({ team, price }) {
  const [amt, setAmt] = useState("");
  return (
    <div style={S.betRow}>
      <span style={{ flex: 1 }}>{team} <small>@ {price}</small></span>
      <input
        type="number" min="1" placeholder="$" value={amt}
        onChange={(e) => setAmt(e.target.value)} style={S.amt}
      />
      <button
        onClick={() =>
          api("/bet", { team, match: "World Cup", amount: Number(amt) })
            .then(() => setAmt(""))
            .catch((e) => alert(e.message))
        }
      >Bet</button>
    </div>
  );
}

function Auth({ onAuth }) {
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [err, setErr] = useState("");
  const go = (path) =>
    api(path, { username: u, password: p })
      .then((d) => onAuth(d.username))
      .catch((e) => setErr(e.message));
  return (
    <div style={{ ...S.page, maxWidth: 320 }}>
      <h1>Sign in</h1>
      <input placeholder="username" value={u} onChange={(e) => setU(e.target.value)} style={S.input} />
      <input type="password" placeholder="password" value={p} onChange={(e) => setP(e.target.value)} style={S.input} />
      {err && <p style={{ color: "crimson" }}>{err}</p>}
      <button onClick={() => go("/login")} style={S.input}>Log in</button>
      <button onClick={() => go("/signup")} style={S.input}>Sign up</button>
    </div>
  );
}

const S = {
  page: { fontFamily: "system-ui, sans-serif", maxWidth: 900, margin: "2rem auto", padding: "0 1rem" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  cols: { display: "flex", gap: "2rem", flexWrap: "wrap" },
  col: { flex: 1, minWidth: 280 },
  betRow: { display: "flex", gap: 8, alignItems: "center", margin: "6px 0" },
  amt: { width: 70 },
  input: { display: "block", width: "100%", margin: "6px 0", padding: 8, boxSizing: "border-box" },
  barLabel: { display: "flex", justifyContent: "space-between", fontSize: 14 },
  bar: { height: 14, background: "#4f46e5", borderRadius: 4, minWidth: 2 },
};
