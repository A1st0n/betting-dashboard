// Team crest image, lazy-loaded, self-hiding if the badge 404s. no deps.
import React from "react";
import { crest } from "./flags.js";

export default function Crest({ teamId, team }) {
  if (teamId == null) return null;
  return (
    <img
      className="crest"
      src={crest(teamId)}
      alt={team || ""}
      title={team || ""}
      width={20}
      height={20}
      loading="lazy"
      onError={(e) => (e.currentTarget.style.display = "none")}
    />
  );
}
