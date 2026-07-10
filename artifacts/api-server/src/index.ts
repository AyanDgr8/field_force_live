import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import app from "./app";
import { pool } from "@workspace/db";
import { logger } from "./lib/logger";

const rawPort = process.env.PORT;
if (!rawPort) throw new Error("PORT environment variable is required");

const port = Number(rawPort);
if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const appRoot = process.env.APP_ROOT
  ? path.resolve(process.env.APP_ROOT)
  : path.resolve(import.meta.dirname, "../../../");
const useHttps = process.env.USE_HTTPS === "true";

function createServer(): http.Server | https.Server {
  if (!useHttps) {
    logger.info("Initialized HTTP server");
    return http.createServer(app);
  }

  const keyPath = path.resolve(
    appRoot,
    process.env.SSL_KEY_PATH ?? "ssl/privkey.pem",
  );
  const certPath = path.resolve(
    appRoot,
    process.env.SSL_CERT_PATH ?? "ssl/fullchain.pem",
  );

  try {
    const server = https.createServer(
      {
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certPath),
      },
      app,
    );
    logger.info({ keyPath, certPath }, "Initialized HTTPS server");
    return server;
  } catch (error) {
    logger.fatal(
      { err: error, keyPath, certPath },
      "Unable to load SSL certificate files",
    );
    throw error;
  }
}

const server = createServer();
let shuttingDown = false;

async function start(): Promise<void> {
  const connection = await pool.getConnection();
  connection.release();
  logger.info("MySQL connection verified");

  server.listen(port, "0.0.0.0", () => {
    logger.info({ port, protocol: useHttps ? "https" : "http" }, "Server listening");
  });
}

async function gracefulShutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "Closing server and database connections");

  server.close(async (error) => {
    if (error) logger.error({ err: error }, "Error closing server");
    try {
      await pool.end();
      logger.info("Server and database connections closed");
      process.exit(error ? 1 : 0);
    } catch (poolError) {
      logger.error({ err: poolError }, "Error closing database pool");
      process.exit(1);
    }
  });

  setTimeout(() => {
    logger.error("Forced shutdown after timeout");
    process.exit(1);
  }, 10_000).unref();
}

process.on("SIGTERM", () => void gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => void gracefulShutdown("SIGINT"));

start().catch((error) => {
  logger.fatal({ err: error }, "Application startup failed");
  void pool.end().finally(() => process.exit(1));
});
