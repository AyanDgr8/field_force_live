/**
 * Background scheduler for the report mailbox.
 *
 * Mirrors the device poller: a single timer, exponential backoff on failure,
 * and a guard so overlapping sweeps can never run concurrently.
 */
import { logger } from "../logger.js";
import { loadEmailReportsConfig, configurationProblem } from "./config.js";
import { runIngestSweep } from "./ingest.js";

const MAX_BACKOFF_MS = 60 * 60 * 1000;
const FIRST_SWEEP_DELAY_MS = 15_000;

let timer: ReturnType<typeof setTimeout> | null = null;
let started = false;
let sweeping = false;
let consecutiveFailures = 0;
let lastSweepAt: Date | null = null;
let lastError: string | null = null;

export function pollerState() {
  return {
    started,
    sweeping,
    lastSweepAt,
    lastError,
    consecutiveFailures,
  };
}

async function sweepOnce(): Promise<void> {
  // A manual sweep from the API can overlap the timer; the later one waits.
  if (sweeping) return;
  sweeping = true;
  try {
    const result = await runIngestSweep();
    lastSweepAt = new Date();
    // `reason` is set when the mailbox itself could not be read; per-message
    // download failures are recorded on their rows and are not backoff-worthy.
    lastError = result.ran ? result.reason : result.reason;
    consecutiveFailures = result.ran && !result.reason ? 0 : consecutiveFailures + 1;
  } catch (err) {
    consecutiveFailures++;
    lastError = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "Report mailbox sweep threw");
  } finally {
    sweeping = false;
  }
}

function scheduleNext(intervalMs: number): void {
  const backoff = Math.min(intervalMs * 2 ** Math.min(consecutiveFailures, 6), MAX_BACKOFF_MS);
  const delay = consecutiveFailures > 0 ? backoff : intervalMs;
  timer = setTimeout(() => { void tick(intervalMs); }, delay);
  timer.unref?.();
}

async function tick(intervalMs: number): Promise<void> {
  await sweepOnce();
  scheduleNext(intervalMs);
}

export async function startEmailReportsPoller(): Promise<void> {
  if (started) return;

  const config = loadEmailReportsConfig();
  const problem = configurationProblem(config);
  if (problem) {
    logger.info({ reason: problem }, "Report mailbox watcher idle — not configured");
    return;
  }
  if (!config.enabled) {
    logger.info("Report mailbox watcher disabled (EMAIL_REPORTS_ENABLED=false)");
    return;
  }

  started = true;
  const intervalMs = config.pollSeconds * 1000;
  logger.info(
    { host: config.host, mailbox: config.mailbox, user: config.user, everySeconds: config.pollSeconds },
    "Report mailbox watcher started",
  );

  // Delayed so the first sweep does not compete with server start-up.
  timer = setTimeout(() => { void tick(intervalMs); }, FIRST_SWEEP_DELAY_MS);
  timer.unref?.();
}

export function stopEmailReportsPoller(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  started = false;
}

/** Triggers a sweep now, outside the timer — used by the manual run endpoint. */
export async function sweepNow() {
  const result = await runIngestSweep();
  lastSweepAt = new Date();
  lastError = result.reason;
  return result;
}
