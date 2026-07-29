import path from "node:path";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";

try {
  process.loadEnvFile(path.resolve(process.cwd(), "../../.env"));
} catch {
  // Environment variables may already be supplied by the shell/host.
}

// The database client reads its configuration while the module is initialized,
// so import it only after the workspace .env file has been loaded.
const {
  db,
  insertReturning,
  customersTable,
  credentialsTable,
  usersTable,
} = await import("@workspace/db");

const required = ["SUPER_ADMIN_EMAIL", "SUPER_ADMIN_PASSWORD", "SUPER_ADMIN_NAME"] as const;
const missing = required.filter(key => !process.env[key]);
if (missing.length) {
  console.error(`Missing: ${missing.join(", ")}`);
  console.error("Set SUPER_ADMIN_NAME, SUPER_ADMIN_EMAIL, and SUPER_ADMIN_PASSWORD.");
  process.exit(1);
}
if (process.env.SUPER_ADMIN_PASSWORD!.length < 8) {
  console.error("SUPER_ADMIN_PASSWORD must contain at least 8 characters.");
  process.exit(1);
}

const customers = await db.select().from(customersTable);
if (customers.length === 0) throw new Error("No organization exists. Create the organization first.");
if (customers.length > 1) {
  throw new Error("Multiple organizations exist. Super Admin bootstrap requires an organization-management workflow.");
}
const customerId = customers[0].id;

const email = process.env.SUPER_ADMIN_EMAIL!.trim().toLowerCase();
const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, email));

const parts = process.env.SUPER_ADMIN_NAME!.trim().split(/\s+/);
const firstName = parts.shift()!;
const lastName = parts.join(" ") || "Admin";
const slug = `${firstName}.${lastName}`
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ".")
  .replace(/^\.|\.$/g, "")
  .slice(0, 32) || "superadmin";
const uniqueSuffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const employeeCode = `SA-${uniqueSuffix.toUpperCase()}`;
const username = `sa.${slug}.${uniqueSuffix}`;
const passwordHash = await bcrypt.hash(process.env.SUPER_ADMIN_PASSWORD!, 12);
const user = existing ?? await insertReturning(usersTable, {
  customerId, firstName, lastName, gender: "OTHER", employeeCode,
  phoneNumber: process.env.SUPER_ADMIN_PHONE ?? "0000000000",
  email, role: "SUPER_ADMIN", status: "ACTIVE", consentGivenAt: new Date(),
});
if (existing) {
  await db.update(usersTable).set({
    firstName, lastName, employeeCode,
    phoneNumber: process.env.SUPER_ADMIN_PHONE ?? existing.phoneNumber,
    role: "SUPER_ADMIN", status: "ACTIVE", deletedAt: null,
  }).where(eq(usersTable.id, existing.id));
  const [credential] = await db.select().from(credentialsTable)
    .where(eq(credentialsTable.userId, existing.id));
  if (credential) {
    await db.update(credentialsTable).set({ username, passwordHash })
      .where(eq(credentialsTable.id, credential.id));
  } else {
    await db.insert(credentialsTable).values({ userId: existing.id, username, passwordHash });
  }
} else {
  await db.insert(credentialsTable).values({ userId: user.id, username, passwordHash });
}
console.log("Super Admin created successfully");
console.log(`Username: ${username}`);
console.log(`Employee code: ${employeeCode}`);
console.log(`Organization: ${customers[0].name} (system ID ${customerId})`);
console.log(`User ID: ${user.id}`);
if (existing) console.log("Existing account promoted to Super Admin");
process.exit(0);
