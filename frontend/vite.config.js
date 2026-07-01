import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev: proxy API + websocket to Flask. macOS: :5000 is AirPlay, so default :5057.
// Override with FLASK_PORT if you run the backend elsewhere.
const target = `http://localhost:${process.env.FLASK_PORT || 5057}`;

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": target,
      "/socket.io": { target, ws: true },
    },
  },
});
