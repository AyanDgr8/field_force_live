#!/usr/bin/env node

const { spawn } = require("node:child_process");
const path = require("node:path");

const workspaceRoot = __dirname;
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const scriptArgs = process.argv.slice(2);

const child = spawn(
  pnpm,
  [
    "--filter",
    "@workspace/api-server",
    "exec",
    "tsx",
    "src/scripts/sendWelcomeEmails.ts",
    ...scriptArgs,
  ],
  {
    cwd: workspaceRoot,
    env: process.env,
    stdio: "inherit",
  },
);

child.on("error", (error) => {
  console.error(`Unable to start the welcome-email script: ${error.message}`);
  process.exitCode = 1;
});

child.on("exit", (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
