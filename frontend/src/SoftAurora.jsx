// Soft aurora background (reactbits.dev/backgrounds/soft-aurora), CSS-only, no deps.
// Fixed full-screen layer of drifting radial gradients behind the app.
import React from "react";

const css = `
.soft-aurora {
  position: fixed;
  inset: 0;
  z-index: -1;
  overflow: hidden;
  background: #f6f8fc;
  contain: strict;  /* isolate this layer so it never repaints on page scroll */
}
.soft-aurora span {
  position: absolute;
  width: 55vmax;
  height: 55vmax;
  filter: blur(48px);      /* ponytail: 48 reads the same as 60, cheaper to composite */
  opacity: 0.42;           /* plain alpha instead of mix-blend-mode (multiply repaints hot) */
  will-change: transform;
}
/* each blob drifts its own way: different path, speed, spin, easing */
.soft-aurora span:nth-child(1) { top: -18%; left: -12%; background: radial-gradient(circle, #a5b4fc, transparent 70%); animation: drift-a 26s ease-in-out infinite alternate; }
.soft-aurora span:nth-child(2) { top: 6%;  right: -18%; background: radial-gradient(circle, #7dd3fc, transparent 70%); animation: drift-b 19s cubic-bezier(.5,0,.5,1) -4s infinite alternate; }
.soft-aurora span:nth-child(3) { bottom: -22%; left: 18%; background: radial-gradient(circle, #6ee7b7, transparent 70%); animation: drift-c 33s ease-in-out -11s infinite alternate; }
.soft-aurora span:nth-child(4) { bottom: 2%; right: 8%; background: radial-gradient(circle, #f0abfc, transparent 70%); animation: drift-d 23s ease-in-out -7s infinite alternate; }
@keyframes drift-a { from { transform: translate3d(0,0,0) rotate(0deg) scale(1); } to { transform: translate3d(9vmax,5vmax,0) rotate(25deg) scale(1.2); } }
@keyframes drift-b { from { transform: translate3d(0,0,0) rotate(0deg) scale(1.1); } to { transform: translate3d(-7vmax,8vmax,0) rotate(-30deg) scale(0.85); } }
@keyframes drift-c { from { transform: translate3d(0,0,0) rotate(10deg) scale(0.9); } to { transform: translate3d(6vmax,-9vmax,0) rotate(-15deg) scale(1.25); } }
@keyframes drift-d { from { transform: translate3d(0,0,0) rotate(0deg) scale(1); } to { transform: translate3d(-10vmax,-4vmax,0) rotate(40deg) scale(1.15); } }
@media (prefers-reduced-motion: reduce) { .soft-aurora span { animation: none; } }
`;

export default function SoftAurora() {
  return (
    <div className="soft-aurora" aria-hidden="true">
      <style>{css}</style>
      <span /><span /><span /><span />
    </div>
  );
}
