// True Focus text animation (reactbits.dev/text-animations/true-focus), no deps.
// Cycles a focus frame across words; unfocused words blur. CSS + one interval.
import React, { useEffect, useState } from "react";

const css = `
.true-focus {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4em;
  justify-content: center;
  font-weight: 800;
  line-height: 1.3;
}
.true-focus .tf-word {
  position: relative;
  filter: blur(var(--tf-blur, 6px));
  opacity: 0.55;
  transition: filter 0.5s, opacity 0.5s;
}
.true-focus .tf-word.tf-active {
  filter: blur(0);
  opacity: 1;
}
.true-focus .tf-word.tf-active::before,
.true-focus .tf-word.tf-active::after {
  content: "";
  position: absolute;
  width: 0.6em;
  height: 0.6em;
  border: 2px solid var(--tf-color, #6366f1);
  box-shadow: 0 0 8px var(--tf-color, #6366f1);
}
.true-focus .tf-word.tf-active::before { top: -6px; left: -6px; border-right: 0; border-bottom: 0; }
.true-focus .tf-word.tf-active::after { bottom: -6px; right: -6px; border-left: 0; border-top: 0; }
@media (prefers-reduced-motion: reduce) {
  .true-focus .tf-word { filter: none; opacity: 1; }
}
`;

export default function TrueFocus({
  sentence = "True Focus",
  blurAmount = 6,
  borderColor = "#6366f1",
  interval = 1000,
}) {
  const words = sentence.split(" ");
  const [active, setActive] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setActive((i) => (i + 1) % words.length), interval);
    return () => clearInterval(id);
  }, [words.length, interval]);

  return (
    <span
      className="true-focus"
      style={{ "--tf-blur": `${blurAmount}px`, "--tf-color": borderColor }}
    >
      <style>{css}</style>
      {words.map((w, i) => (
        <span key={i} className={i === active ? "tf-word tf-active" : "tf-word"}>
          {w}
        </span>
      ))}
    </span>
  );
}
