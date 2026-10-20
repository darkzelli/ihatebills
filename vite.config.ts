import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
// @ts-expect-error type error without @types/node package
import process from "node:process";
// @ts-expect-error type error without @types/node package
import fs from "node:fs";
// @ts-expect-error type error without @types/node package
import path from "node:path";
const host = process.env.TAURI_DEV_HOST;

// pdf.js loads fonts, cmaps and wasm decoders at runtime; serve them at /pdfjs/<dir>/.
const PDFJS_DIRS = ["cmaps", "standard_fonts", "wasm", "iccs"];
function pdfjsAssets(): Plugin {
  const root = path.resolve("node_modules/pdfjs-dist");
  return {
    name: "pdfjs-assets",
    configureServer(server) {
      server.middlewares.use("/pdfjs", (req, res, next) => {
        const rel = decodeURIComponent((req.url ?? "").split("?")[0]).replace(/^\/+/, "");
        const file = path.join(root, rel);
        if (!PDFJS_DIRS.includes(rel.split("/")[0]) || rel.includes("..") || !fs.existsSync(file)) return next();
        if (file.endsWith(".wasm")) res.setHeader("Content-Type", "application/wasm");
        fs.createReadStream(file).pipe(res);
      });
    },
    generateBundle() {
      for (const dir of PDFJS_DIRS) {
        for (const name of fs.readdirSync(path.join(root, dir))) {
          this.emitFile({ type: "asset", fileName: `pdfjs/${dir}/${name}`, source: fs.readFileSync(path.join(root, dir, name)) });
        }
      }
    },
  };
}

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [react(), pdfjsAssets()],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
