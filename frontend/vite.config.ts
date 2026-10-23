import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

const backend = process.env.NTERI_BACKEND_URL ?? "http://127.0.0.1:8000";

export default defineConfig({
  plugins: [tailwindcss(), reactRouter()],
  resolve: {
    tsconfigPaths: true,
  },
  server: {
    proxy: {
      "/api": {
        target: backend,
      },
      "/ws": {
        target: backend,
        ws: true,
      },
    },
  },
});
