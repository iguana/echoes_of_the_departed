import { defineConfig } from "vite";
import { readdirSync, existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const SOUNDTRACK_DIR = resolve(__dirname, "soundtrack");
const MANIFEST_PATH = "/soundtrack-manifest.json";
const AUDIO_RE = /\.(mp3|m4a|ogg|wav)$/i;

function listSoundtracks(): string[] {
  if (!existsSync(SOUNDTRACK_DIR)) return [];
  return readdirSync(SOUNDTRACK_DIR)
    .filter((f) => AUDIO_RE.test(f))
    .sort();
}

/** In dev: serve manifest from middleware; in build: write static manifest into dist. */
function soundtrackManifest() {
  return {
    name: "soundtrack-manifest",
    configureServer(server: import("vite").ViteDevServer) {
      server.middlewares.use(MANIFEST_PATH, (_req, res) => {
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Cache-Control", "no-store");
        res.end(JSON.stringify({ tracks: listSoundtracks() }));
      });
    },
    closeBundle() {
      // For production builds, materialize the manifest as a static file.
      const tracks = listSoundtracks();
      writeFileSync(
        resolve(__dirname, "dist", "soundtrack-manifest.json"),
        JSON.stringify({ tracks }),
      );
    },
  };
}

/** Dev-only debug bridge: agents POST a JSON action to /debug-action, the
 *  game polls GET /debug-action every 500ms, runs it, then POSTs the result
 *  back to /debug-result. Agents GET /debug-result to read recent results. */
function debugBridge() {
  const queue: string[] = [];
  const results: { ts: number; action: string; result: unknown }[] = [];
  return {
    name: "debug-bridge",
    configureServer(server: import("vite").ViteDevServer) {
      server.middlewares.use("/debug-action", (req, res) => {
        if (req.method === "POST") {
          let buf = "";
          req.on("data", (chunk: Buffer) => { buf += chunk.toString(); });
          req.on("end", () => {
            try {
              JSON.parse(buf); // validate
              queue.push(buf);
              res.statusCode = 202;
              res.end(JSON.stringify({ queued: true, depth: queue.length }));
            } catch (e) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: String(e) }));
            }
          });
        } else {
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Cache-Control", "no-store");
          const next = queue.shift() ?? null;
          res.end(JSON.stringify({ action: next }));
        }
      });
      server.middlewares.use("/debug-result", (req, res) => {
        if (req.method === "POST") {
          let buf = "";
          req.on("data", (chunk: Buffer) => { buf += chunk.toString(); });
          req.on("end", () => {
            try {
              const obj = JSON.parse(buf);
              results.push({ ts: Date.now(), action: obj.action, result: obj.result });
              if (results.length > 100) results.shift();
              res.statusCode = 204;
              res.end();
            } catch (e) {
              res.statusCode = 400;
              res.end(String(e));
            }
          });
        } else {
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Cache-Control", "no-store");
          res.end(JSON.stringify({ results: results.slice(-20) }));
        }
      });
    },
  };
}

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  clearScreen: false,
  plugins: [soundtrackManifest(), debugBridge()],
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
    // Allow Vite to read symlinked files outside /public.
    fs: { allow: [resolve(__dirname), SOUNDTRACK_DIR] },
  },
  build: {
    target: "esnext",
    minify: "esbuild",
    sourcemap: false,
  },
});
