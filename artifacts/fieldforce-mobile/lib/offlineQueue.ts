/**
 * Durable offline queue for field agents.
 *
 * Agents routinely lose signal mid-route (basements, lifts, rural stops). Before
 * this existed, buffered GPS pings lived only in a `useRef` and a closed visit
 * was a straight `apiPost` — so backgrounding or killing the app silently
 * destroyed unsent work.
 *
 * Everything here is written to AsyncStorage *before* the network is attempted,
 * so a queued item survives an app kill and is replayed on next launch.
 *
 * Ordering matters: a stop's disposition must not land before the status change
 * that precedes it, so the queue drains strictly head-first and stops on the
 * first retryable failure rather than skipping ahead.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { ApiError, apiPost } from '@/lib/api';

const STORAGE_KEY = 'ff_offline_queue_v1';

/** Beyond this the queue is dropping oldest-first; a week offline is not a real case. */
const MAX_ITEMS = 500;

/** Give up on an item that keeps failing so one poison payload cannot wedge the queue. */
const MAX_ATTEMPTS = 8;

export interface QueuedRequest {
  id: string;
  path: string;
  body: unknown;
  createdAt: string;
  attempts: number;
}

export type QueueListener = (pending: number) => void;

let queue: QueuedRequest[] = [];
let loaded = false;
let flushing = false;
let seq = 0;
const listeners = new Set<QueueListener>();

// ─── Persistence ──────────────────────────────────────────────────────────────

function notify() {
  for (const l of listeners) l(queue.length);
}

async function persist() {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch {
    // A failed write only costs durability, not correctness — the in-memory
    // queue still drains this session.
  }
  notify();
}

/** Must be awaited once on startup before the first enqueue/flush. */
export async function loadQueue(): Promise<void> {
  if (loaded) return;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    queue = Array.isArray(parsed) ? parsed.filter(isQueuedRequest) : [];
  } catch {
    queue = [];
  }
  loaded = true;
  notify();
}

function isQueuedRequest(v: unknown): v is QueuedRequest {
  return (
    !!v &&
    typeof v === 'object' &&
    typeof (v as QueuedRequest).path === 'string' &&
    typeof (v as QueuedRequest).id === 'string'
  );
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function subscribe(listener: QueueListener): () => void {
  listeners.add(listener);
  listener(queue.length);
  return () => listeners.delete(listener);
}

export function pendingCount(): number {
  return queue.length;
}

/** Queue a POST for delivery, persist it, then opportunistically try to drain. */
export async function enqueue(path: string, body: unknown): Promise<void> {
  if (!loaded) await loadQueue();

  seq += 1;
  queue.push({
    // Date.now + counter: unique per device without pulling in a uuid dep.
    id: `${Date.now()}-${seq}`,
    path,
    body,
    createdAt: new Date().toISOString(),
    attempts: 0,
  });

  if (queue.length > MAX_ITEMS) queue.splice(0, queue.length - MAX_ITEMS);

  await persist();
  void flush();
}

/**
 * Send the queue head-first. Returns the number successfully delivered.
 * Safe to call concurrently — overlapping calls collapse into the running one.
 */
export async function flush(): Promise<number> {
  if (!loaded) await loadQueue();
  if (flushing || queue.length === 0) return 0;

  flushing = true;
  let delivered = 0;

  try {
    while (queue.length > 0) {
      const item = queue[0];
      try {
        await apiPost(item.path, item.body);
        queue.shift();
        delivered += 1;
        await persist();
      } catch (err) {
        // Permanently rejected: drop it and keep draining the rest.
        if (err instanceof ApiError && err.isPermanent) {
          queue.shift();
          await persist();
          continue;
        }

        // Transient (offline / 5xx). Count the attempt and stop — retrying the
        // rest now would reorder writes and almost certainly fail too.
        item.attempts += 1;
        if (item.attempts >= MAX_ATTEMPTS) {
          queue.shift();
        }
        await persist();
        break;
      }
    }
  } finally {
    flushing = false;
  }

  return delivered;
}

/** Test/logout helper — discards everything pending. */
export async function clearQueue(): Promise<void> {
  queue = [];
  await persist();
}
