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
const apiProtocol = process.env.USE_HTTPS === "true" ? "https" : "http";
const children = [];
let stopping = false;

function run(packageDirectory, env) {
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const child = spawn(npmCommand, ["--prefix", packageDirectory, "run", "dev"], {
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
  children.push(child);
  return child;
}

function stop(signal = "SIGTERM") {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) child.kill(signal);
  }
}

const api = run("artifacts/api-server", {
  PORT: apiPort,
  APP_ROOT: process.cwd(),
});

const frontend = run("artifacts/fieldforce-admin", {
  PORT: frontendPort,
  BASE_PATH: process.env.BASE_PATH ?? "/",
  API_PROXY_TARGET:
    process.env.API_PROXY_TARGET ?? `${apiProtocol}://localhost:${apiPort}`,
  API_PROXY_SECURE:
    process.env.API_PROXY_SECURE ?? (apiProtocol === "https" ? "false" : "true"),
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => stop(signal));
}

const results = await Promise.all(
  [api, frontend].map(
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
