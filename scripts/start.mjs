import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { networkInterfaces } from "node:os";

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
// The Expo dev server is opt-in: most backend work does not need it, and it
// pulls in a Metro bundler that is slow to boot.
const startMobile = process.env.START_MOBILE === "true";
const children = [];
let stopping = false;

function localNetworkAddress() {
  const candidates = Object.values(networkInterfaces()).flat();
  return (
    candidates.find(
      (address) =>
        address?.family === "IPv4" &&
        !address.internal &&
        /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(address.address),
    )?.address ??
    candidates.find(
      (address) => address?.family === "IPv4" && !address.internal,
    )?.address ??
    "localhost"
  );
}

function run(packageDirectory, env, script = "dev") {
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const child = spawn(npmCommand, ["--prefix", packageDirectory, "run", script], {
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
  // This script is the local development launcher. Production starts the
  // already-built API directly and may enable HTTPS there.
  NODE_ENV: "development",
  USE_HTTPS: "false",
});

const frontend = run("artifacts/fieldforce-admin", {
  PORT: frontendPort,
  APP_ROOT: process.cwd(),
  NODE_ENV: "development",
  USE_HTTPS: "false",
  BASE_PATH: process.env.BASE_PATH ?? "/",
  API_PROXY_TARGET:
    process.env.API_PROXY_TARGET ?? `http://localhost:${apiPort}`,
  API_PROXY_SECURE:
    process.env.API_PROXY_SECURE ?? "false",
  MOBILE_PORT: mobilePort,
  VITE_MOBILE_APP_URL:
    process.env.VITE_MOBILE_APP_URL ??
    `exp://${localNetworkAddress()}:${mobilePort}`,
});

// Expo needs an absolute origin for /api/* because the mobile bundle is served
// from the Metro port, not behind the admin panel's dev proxy.
const mobile = startMobile
  ? run(
      "artifacts/fieldforce-mobile",
      {
        PORT: mobilePort,
        APP_ROOT: process.cwd(),
        NODE_ENV: "development",
        EXPO_PUBLIC_API_PORT: apiPort,
        // Local LAN mode derives Metro's host and uses HTTP. MOBILE_API_URL is
        // an explicit opt-in for tunnel/live testing; it deliberately avoids
        // inheriting the production URL from the root .env by accident.
        EXPO_PUBLIC_API_URL: process.env.MOBILE_API_URL ?? "",
        EXPO_PUBLIC_DOMAIN: "",
      },
      process.env.MOBILE_TUNNEL === "true" ? "dev:tunnel" : "dev",
    )
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
