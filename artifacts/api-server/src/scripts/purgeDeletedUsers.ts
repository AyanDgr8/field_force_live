/**
 * Removes accounts left behind by the old soft-delete, which renamed a user to
 * `DELETED-<id>-<ts>` and marked it SUSPENDED instead of deleting the row.
 * Deleting a user now purges it outright, so these tombstones are the only ones
 * that can exist.
 *
 *   pnpm --filter @workspace/api-server purge-deleted-users          # dry run
 *   pnpm --filter @workspace/api-server purge-deleted-users --apply  # delete
 */
import path from "node:path";
import { isNotNull } from "drizzle-orm";

try {
  process.loadEnvFile(path.resolve(process.cwd(), "../../.env"));
} catch {
  // Environment variables may already be supplied by the shell/host.
}

// The database client reads its configuration while the module is initialized,
// so import it only after the workspace .env file has been loaded.
const { db, usersTable } = await import("@workspace/db");
const { purgeUser } = await import("../lib/userPurge.js");

const apply = process.argv.includes("--apply");

const tombstoned = await db.select().from(usersTable).where(isNotNull(usersTable.deletedAt));

if (tombstoned.length === 0) {
  console.log("No soft-deleted users found. Nothing to purge.");
  process.exit(0);
}

console.log(`${tombstoned.length} soft-deleted user(s):`);
for (const user of tombstoned) {
  console.log(`  #${user.id} ${user.firstName} ${user.lastName} — ${user.role}, deleted ${user.deletedAt?.toISOString()}`);
}

if (!apply) {
  console.log("\nDry run. Re-run with --apply to delete these accounts and all their records.");
  process.exit(0);
}

for (const user of tombstoned) {
  await db.transaction(async tx => { await purgeUser(tx, user); });
  console.log(`Purged #${user.id} ${user.firstName} ${user.lastName}`);
}

console.log(`\nDone. ${tombstoned.length} account(s) removed.`);
process.exit(0);
