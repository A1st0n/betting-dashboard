// macOS-style Dock (reactbits.dev/components/dock), no deps.
// Fixed bottom-center; icons magnify by cursor proximity. items: [{label, icon, onClick}].
import React, { useRef } from "react";

const css = `
.dock {
  position: fixed;
  left: 50%;
  bottom: 18px;
  transform: translateX(-50%);
  display: flex;
  align-items: flex-end;
  gap: 10px;
  padding: 10px 14px;
  border-radius: 18px;
  background: #ffffff;  /* ponytail: solid, not backdrop-blur  blur repaints on every scroll frame */
  border: 1px solid #d9e2ec;
  box-shadow: 0 18px 45px rgba(24, 33, 47, 0.18);
  z-index: 60;
  font-family: "Courier New", Courier, monospace;
}
.dock-item {
  --s: 44px;
  width: var(--s);
  height: var(--s);
  display: grid;
  place-items: center;
  border-radius: 12px;
  background: #eef2f7;
  color: #334155;
  cursor: pointer;
  transition: transform 0.12s ease-out, background 0.2s;
  transform-origin: bottom center;
}
.dock-item:hover { background: #dbeafe; color: #1d4ed8; }
.dock-item.is-active {
  background: #1d4ed8;
  color: #fff;
  box-shadow: 0 0 0 2px rgba(29, 78, 216, 0.35);
}
.dock-item .dock-label {
  position: absolute;
  bottom: calc(var(--s) + 14px);
  padding: 3px 8px;
  border-radius: 6px;
  background: #111827;
  color: #fff;
  font-size: 0.72rem;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s;
}
.dock-item:hover .dock-label { opacity: 1; }
@media (prefers-reduced-motion: reduce) { .dock-item { transition: none; } }
`;

export default function Dock({ items, active }) {
  const ref = useRef(null);

  function magnify(clientX) {
    const el = ref.current;
    if (!el) return;
    for (const item of el.children) {
      if (!item.classList.contains("dock-item")) continue;
      const r = item.getBoundingClientRect();
      const dist = Math.abs(clientX - (r.left + r.width / 2));
      // ponytail: linear falloff over 140px; scale 1 -> 1.6 near the cursor
      const scale = 1 + 0.6 * Math.max(0, 1 - dist / 140);
      item.style.transform = `scale(${scale})`;
    }
  }

  function reset() {
    const el = ref.current;
    if (!el) return;
    for (const item of el.children) item.style.transform = "";
  }

  return (
    <nav
      className="dock"
      ref={ref}
      onPointerMove={(e) => magnify(e.clientX)}
      onPointerLeave={reset}
      aria-label="Section navigation"
    >
      <style>{css}</style>
      {items.map((it) => (
        <button
          key={it.label}
          className={it.label === active ? "dock-item is-active" : "dock-item"}
          onClick={it.onClick}
          title={it.label}
          type="button"
        >
          {it.icon}
          <span className="dock-label">{it.label}</span>
        </button>
      ))}
    </nav>
  );
}
