import { existsSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { networkInterfaces } from "node:os";
import net from "node:net";

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
// A tunnel makes the development bundle reachable from mobile data and other
// networks. Set MOBILE_TUNNEL=false only when deliberately testing over LAN.
const mobileTunnel = process.env.MOBILE_TUNNEL !== "false";
const children = [];
let stopping = false;

function portOwner(port) {
  if (process.platform === "win32") return "";
  const result = spawnSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], {
    encoding: "utf8",
  });
  const pid = result.stdout.trim().split(/\s+/)[0];
  return pid ? ` (PID ${pid})` : "";
}

function assertPortAvailable(port, service) {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.once("error", (error) => {
      if (error.code === "EADDRINUSE") {
        reject(
          new Error(
            `${service} port ${port} is already in use${portOwner(port)}.\n` +
            `Stop the old process with: kill $(lsof -tiTCP:${port} -sTCP:LISTEN)`,
          ),
        );
      } else {
        reject(error);
      }
    });
    probe.listen(Number(port), "0.0.0.0", () => probe.close(resolve));
  });
}

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

try {
  await assertPortAvailable(apiPort, "API");
  await assertPortAvailable(frontendPort, "Admin dashboard");
  if (startMobile) await assertPortAvailable(mobilePort, "Expo");
} catch (error) {
  console.error(`\nCannot start FieldForce:\n${error.message}\n`);
  process.exit(1);
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
        // Always inject a phone-reachable API origin. A physical device treats
        // localhost/127.0.0.1 as itself, not as the development computer.
        // Tunnel mode also needs a public API: Expo tunnels Metro, not port 7070.
        EXPO_PUBLIC_API_URL:
          process.env.MOBILE_API_URL ??
          (mobileTunnel ? process.env.APP_URL : undefined) ??
          `http://${localNetworkAddress()}:${apiPort}`,
        EXPO_PUBLIC_DOMAIN: "",
      },
      mobileTunnel ? "dev:tunnel" : "dev:lan",
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
