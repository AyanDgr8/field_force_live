import { existsSync } from "node:fs";
import { spawn } from "node:child_process";

if (existsSync(".env")) {
  process.loadEnvFile(".env");
}

if (!process.env.DATABASE_URL && !process.env.MYSQL_HOST) {
  console.error(
    [
      "\nCannot start the backend: MySQL configuration is missing.",
      "Copy .env.example to .env and update the MySQL settings:",
      "  cp .env.example .env\n",
    ].join("\n"),
  );
  process.exit(1);
}

const apiPort = process.env.API_PORT ?? "7070";
const frontendPort = process.env.FRONTEND_PORT ?? "7075";
const mobilePort = process.env.MOBILE_PORT ?? "8081";
const useHttps = process.env.USE_HTTPS === "true";
// The Expo dev server is opt-in: most backend work does not need it, and it
// pulls in a Metro bundler that is slow to boot.
const startMobile = process.env.START_MOBILE === "true";
const children = [];
let stopping = false;

function run(packageDirectory, env) {
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const child = spawn(npmCommand, ["--prefix", packageDirectory, "run", "dev"], {
    stdio: "inherit",
    env: { ...process.env, ...env },
    // Give each service its own process group so PM2/restart cleanup also
    // terminates grandchildren such as Vite and the built API process.
    detached: process.platform !== "win32",
  });
  children.push(child);
  return child;
}

function stop(signal = "SIGTERM") {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode !== null || child.signalCode !== null) continue;
    if (process.platform === "win32") child.kill(signal);
    else {
      try {
        process.kill(-child.pid, signal);
      } catch {
        child.kill(signal);
      }
    }
  }
}

const api = run("artifacts/api-server", {
  PORT: apiPort,
  APP_ROOT: process.cwd(),
});

const frontend = run("artifacts/fieldforce-admin", {
  PORT: frontendPort,
  APP_ROOT: process.cwd(),
  BASE_PATH: process.env.BASE_PATH ?? "/",
  API_PROXY_TARGET:
    process.env.API_PROXY_TARGET ??
    `${useHttps ? "https" : "http"}://localhost:${apiPort}`,
  API_PROXY_SECURE:
    process.env.API_PROXY_SECURE ?? "false",
});

// Expo needs an absolute origin for /api/* because the mobile bundle is served
// from the Metro port, not behind the admin panel's dev proxy.
const mobile = startMobile
  ? run("artifacts/fieldforce-mobile", {
      PORT: mobilePort,
      APP_ROOT: process.cwd(),
      EXPO_PUBLIC_API_URL:
        process.env.EXPO_PUBLIC_API_URL ??
        `${useHttps ? "https" : "http"}://localhost:${apiPort}`,
    })
  : null;

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => stop(signal));
}

const results = await Promise.all(
  [api, frontend, ...(mobile ? [mobile] : [])].map(
    (child) =>
      new Promise((resolve) => {
        child.on("error", (error) => {
          console.error(`Failed to launch ${child.spawnargs.join(" ")}:`, error);
          stop();
          resolve(1);
        });
        child.on("exit", (code, signal) => {
          stop();
          resolve(code ?? (signal ? 0 : 1));
        });
      }),
  ),
);

process.exitCode = results.find((code) => code !== 0) ?? 0;
