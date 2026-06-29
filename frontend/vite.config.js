import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev: proxy API + websocket to Flask on :5000. Build: outputs to dist/, which Flask serves.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://localhost:5000",
      "/socket.io": { target: "http://localhost:5000", ws: true },
    },
  },
});
