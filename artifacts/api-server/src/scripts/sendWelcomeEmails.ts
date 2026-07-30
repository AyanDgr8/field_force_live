/**
 * Resend the standard welcome email to every non-suspended account in a role.
 *
 * From the workspace root:
 *   node sendEmail.js USER
 *   node sendEmail.js biker
 *   node sendEmail.js HUB_ADMIN --dry-run
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { and, eq, isNull, ne } from "drizzle-orm";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(scriptDirectory, "../../../..");

try {
  process.loadEnvFile(path.join(workspaceRoot, ".env"));
} catch {
  // Production may supply the same values through the process environment.
}

type Role = "SUPER_ADMIN" | "STATE_ADMIN" | "HUB_ADMIN" | "USER";

const ROLE_ALIASES: Record<string, Role> = {
  SUPER_ADMIN: "SUPER_ADMIN",
  SUPERADMIN: "SUPER_ADMIN",
  STATE_ADMIN: "STATE_ADMIN",
  STATEADMIN: "STATE_ADMIN",
  HUB_ADMIN: "HUB_ADMIN",
  HUBADMIN: "HUB_ADMIN",
  USER: "USER",
  USERS: "USER",
  BIKER: "USER",
  BIKERS: "USER",
  AGENT: "USER",
  AGENTS: "USER",
};

const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: "Super Admin",
  STATE_ADMIN: "State Admin",
  HUB_ADMIN: "Hub Admin",
  USER: "Field Agent",
};

function usage(): never {
  console.error(
    [
      "Usage: node sendEmail.js <role_name> [--dry-run]",
      "",
      "Roles: SUPER_ADMIN, STATE_ADMIN, HUB_ADMIN, USER",
      "Aliases: biker, bikers, agent, agents",
      "",
      "Examples:",
      "  node sendEmail.js biker --dry-run",
      "  node sendEmail.js USER",
    ].join("\n"),
  );
  process.exit(1);
}

const cliArguments = process.argv.slice(2);
const roleArgument = cliArguments.find((argument) => !argument.startsWith("--"));
if (!roleArgument) usage();

const normalizedRole = roleArgument.trim().toUpperCase().replace(/[\s-]+/g, "_");
const role = ROLE_ALIASES[normalizedRole];
if (!role) usage();

const dryRun = cliArguments.includes("--dry-run");

// These modules read configuration during initialization, so import them only
// after the workspace .env has been loaded.
const { db, pool, usersTable } = await import("@workspace/db");
const { DEFAULT_USER_PASSWORD, loginUrl, mobileAppUrl, passwordResetRequestUrl } =
  await import("../lib/accounts.js");
const { sendWelcomeEmail, verifyEmailConnection } =
  await import("../lib/mailer.js");

try {
  const users = await db
    .select({
      id: usersTable.id,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      email: usersTable.email,
    })
    .from(usersTable)
    .where(
      and(
        eq(usersTable.role, role),
        ne(usersTable.status, "SUSPENDED"),
        isNull(usersTable.deletedAt),
      ),
    )
    .orderBy(usersTable.id);

  if (users.length === 0) {
    console.log(`No eligible ${role} accounts found.`);
    process.exitCode = 0;
  } else if (dryRun) {
    console.log(`Dry run: ${users.length} ${role} welcome email(s) would be sent:`);
    for (const user of users) {
      console.log(`  #${user.id} ${user.firstName} ${user.lastName} <${user.email}>`);
    }
  } else {
    await verifyEmailConnection();
    console.log(`Sending ${users.length} ${role} welcome email(s)...`);

    let sent = 0;
    let failed = 0;

    for (const user of users) {
      try {
        await sendWelcomeEmail({
          to: user.email,
          recipientName: user.firstName,
          loginEmail: user.email,
          password: DEFAULT_USER_PASSWORD,
          loginUrl: loginUrl(),
          resetUrl: passwordResetRequestUrl(),
          role: ROLE_LABELS[role],
          mobileAppUrl: role === "USER" ? mobileAppUrl() : undefined,
        });
        sent += 1;
        console.log(`SENT   #${user.id} ${user.email}`);
      } catch (error) {
        failed += 1;
        const message = error instanceof Error ? error.message : String(error);
        console.error(`FAILED #${user.id} ${user.email}: ${message}`);
      }
    }

    console.log(`Done. Sent: ${sent}; failed: ${failed}; total: ${users.length}.`);
    if (failed > 0) process.exitCode = 1;
  }
} finally {
  await pool.end();
}
