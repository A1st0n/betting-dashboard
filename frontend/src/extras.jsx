import React, { useState } from "react";
import { CircleDollarSign, Trophy } from "lucide-react";

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

// Player props derived from Opta stats: pick a market, bet a player at derived odds.
export function PropsPanel({ props, balance, onBet }) {
  const markets = Object.keys(props);
  const [market, setMarket] = useState(markets[0]);
  const active = market && props[market] ? market : markets[0];
  const rows = (active && props[active]) || [];

  if (!markets.length) {
    return <EmptyState message="Props appear once the stats feed is fetched." />;
  }

  return (
    <div className="stats-wrap">
      <select
        aria-label="Prop market"
        className="stats-select"
        onChange={(e) => setMarket(e.target.value)}
        value={active}
      >
        {markets.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
      <div className="props-list">
        {rows.map((r, i) => (
          <PropRow
            key={`${r.player}-${i}`}
            row={r}
            label={active}
            balance={balance}
            onBet={onBet}
          />
        ))}
      </div>
    </div>
  );
}

function PropRow({ row, label, balance, onBet }) {
  const stake = 10; // ponytail: fixed mock stake; add an input if you want variable prop bets
  const canBet = balance >= stake;
  const [msg, setMsg] = useState("");

  async function bet() {
    setMsg("");
    try {
      await onBet({
        team: `${row.player} · ${label}`,
        match: label,
        amount: stake,
        odds: row.odds,
      });
      setMsg("✓");
    } catch (e) {
      setMsg(e.message);
    }
  }

  return (
    <div className="prop-row">
      <span className="stats-player">{row.player}</span>
      <span className="stats-team">{row.team}</span>
      <span className="prop-prob">{Math.round(row.prob * 100)}%</span>
      <strong className="stats-value">{row.odds}</strong>
      <button className="primary-button" disabled={!canBet} onClick={bet} type="button">
        <CircleDollarSign size={14} aria-hidden="true" />
        {money.format(stake)}
      </button>
      {msg && <span className="row-message">{msg}</span>}
    </div>
  );
}

// Global ranking of users by mock money wagered.
export function LeaderboardPanel({ rows, me, onSelect }) {
  if (!rows.length) {
    return <EmptyState message="No bets placed yet." />;
  }
  return (
    <ol className="stats-list">
      {rows.map((r, i) => (
        <li className={r.user === me ? "is-me" : undefined} key={r.user}>
          <button className="board-row" onClick={() => onSelect(r.user)} type="button">
            <span className="stats-rank">
              {i === 0 ? <Trophy size={14} aria-hidden="true" /> : i + 1}
            </span>
            <span className="stats-player">{r.user}</span>
            <span className="stats-team">{r.bets} bets</span>
            <strong className="stats-value">{money.format(r.wagered)}</strong>
          </button>
        </li>
      ))}
    </ol>
  );
}

function EmptyState({ message }) {
  return <div className="empty-state">{message}</div>;
}
