import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Em produção (GitHub Pages) a app é servida em /Instagram-automation/.
// Em dev continua na raiz para não atrapalhar o fluxo local.
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/Instagram-automation/" : "/",
  plugins: [react()],
}));
