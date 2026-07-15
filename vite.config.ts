import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";

// スマホ実機テスト時は `npm run dev:https` を使う
// （カメラ・方位センサーは HTTPS でないと動かないため）
export default defineConfig(({ mode }) => ({
  base: "./", // GitHub Pages 配下でも動くように相対パス
  plugins: [react(), ...(mode === "https" ? [basicSsl()] : [])],
  server: { host: true },
}));
