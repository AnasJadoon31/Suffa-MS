import { spawn } from "node:child_process";

export async function ensureViteServer({ baseUrl, envVar = "TEST_BASE_URL", port }) {
  if (process.env[envVar]) return undefined;
  const server = spawn("node_modules/.bin/vite", ["--host", "127.0.0.1", "--port", String(port)], { stdio: "ignore" });
  server.unref();
  const stop = () => {
    if (!server.killed) server.kill();
  };
  process.once("exit", stop);
  process.once("SIGINT", () => {
    stop();
    process.exit(130);
  });
  process.once("SIGTERM", () => {
    stop();
    process.exit(143);
  });
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      if ((await fetch(baseUrl)).ok) return server;
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  stop();
  throw new Error(`Timed out starting Vite on ${baseUrl}`);
}
