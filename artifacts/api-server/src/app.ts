import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { startDevicePoller } from "./lib/devicePoller.js";

const app: Express = express();

const configuredOrigins = (process.env.CORS_ORIGIN ?? "")
  .split(",")
  .map((origin) => origin.trim().replace(/\/+$/, ""))
  .filter(Boolean);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        // Strip query strings so vendor credentials in ?username=…&password=… never appear in logs
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);
app.use(cors({
  origin(origin, callback) {
    // Native mobile applications do not send an Origin header. Browser
    // requests must come from a configured deployment origin in production.
    if (!origin || process.env.NODE_ENV !== "production" || configuredOrigins.includes(origin.replace(/\/+$/, ""))) {
      callback(null, true);
      return;
    }
    callback(new Error("Origin is not allowed by CORS"));
  },
  credentials: true,
}));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// Start GPS device poller (non-blocking — runs in background)
startDevicePoller().catch((err) =>
  logger.error({ err }, "Device poller failed to start")
);

export default app;
