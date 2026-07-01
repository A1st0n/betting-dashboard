// Country -> flag emoji. Free (unicode, no requests). Fallback: empty string.
// ponytail: only the nations we actually show; extend the map as leagues grow.
const FLAGS = {
  Argentina: "🇦🇷", Australia: "🇦🇺", Austria: "🇦🇹", Belgium: "🇧🇪", Brazil: "🇧🇷",
  Cameroon: "🇨🇲", Canada: "🇨🇦", Colombia: "🇨🇴", Croatia: "🇭🇷", Denmark: "🇩🇰",
  Ecuador: "🇪🇨", Egypt: "🇪🇬", England: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", France: "🇫🇷", Germany: "🇩🇪",
  Ghana: "🇬🇭", Iran: "🇮🇷", Italy: "🇮🇹", Japan: "🇯🇵", Mexico: "🇲🇽",
  Morocco: "🇲🇦", Netherlands: "🇳🇱", Nigeria: "🇳🇬", Norway: "🇳🇴", Poland: "🇵🇱",
  Portugal: "🇵🇹", Qatar: "🇶🇦", Senegal: "🇸🇳", Serbia: "🇷🇸", Spain: "🇪🇸",
  Sweden: "🇸🇪", Switzerland: "🇨🇭", Uruguay: "🇺🇾", USA: "🇺🇸", Wales: "🏴󠁧󠁢󠁷󠁬󠁳󠁿",
};

export const flag = (name) => FLAGS[name] || "";

// Opta team crest by team_id (real PNGs; player headshots are auth-gated, these aren't).
// ponytail: only dimensions=150 is cached with real art  smaller sizes 302 to a placeholder.
export const crest = (teamId) =>
  teamId == null
    ? ""
    : `https://omo.akamai.opta.net/image.php?secure=true&h=omo.akamai.opta.net&sport=football&entity=team&description=badges&dimensions=150&id=${teamId}`;
