/**
 * Accept both the current array response and legacy/paginated API envelopes.
 * This keeps list screens resilient while older API processes are restarted.
 */
export function normalizeList<T>(value: unknown, keys: string[] = []): T[] {
  if (Array.isArray(value)) return value as T[];
  if (!value || typeof value !== 'object') return [];

  const record = value as Record<string, unknown>;
  for (const key of [...keys, 'items', 'data', 'results']) {
    if (Array.isArray(record[key])) return record[key] as T[];
  }

  return [];
}
