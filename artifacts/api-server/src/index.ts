import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import https from "node:https";
import app from "./app";
import { logger } from "./lib/logger";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const useHttps = process.env["USE_HTTPS"] === "true";
const appRoot = process.env["APP_ROOT"] ?? process.cwd();

function resolveCertificatePath(value: string | undefined, fallback: string) {
  const configuredPath = value ?? fallback;
  return path.isAbsolute(configuredPath)
    ? configuredPath
    : path.resolve(appRoot, configuredPath);
}

let server: http.Server | https.Server;

if (useHttps) {
  const keyPath = resolveCertificatePath(
    process.env["SSL_KEY_PATH"],
    "ssl/privkey.pem",
  );
  const certPath = resolveCertificatePath(
    process.env["SSL_CERT_PATH"],
    "ssl/fullchain.pem",
  );

  try {
    server = https.createServer(
      {
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certPath),
      },
      app,
    );
  } catch (err) {
    logger.fatal({ err, keyPath, certPath }, "Failed to load SSL certificates");
    process.exit(1);
  }
} else {
  server = http.createServer(app);
}

server.on("error", (err) => {
  logger.error({ err }, "Error listening on port");
  process.exit(1);
});

server.listen(port, "0.0.0.0", () => {
  logger.info(
    { port, protocol: useHttps ? "https" : "http" },
    "Server listening",
  );
});
