import { Router, type IRouter } from "express";
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import * as XLSX from "xlsx";
import {
  db, insertReturning, usersTable, credentialsTable, onboardingInvitesTable,
  statesTable, hubsTable, vehiclesTable, adminStateScopesTable, adminHubScopesTable,
  backgroundVerificationsTable, importJobsTable, deliveryRecordsTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/auth.js";
import { DEFAULT_USER_PASSWORD, loginUrl, mobileAppUrl, passwordResetRequestUrl } from "../lib/accounts.js";
import { sendWelcomeEmail } from "../lib/mailer.js";
import { purgeUser } from "../lib/userPurge.js";

const router: IRouter = Router();

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  STATE_ADMIN: "State Admin",
  HUB_ADMIN: "Hub Admin",
  USER: "Field Agent",
};
const roleRank = { USER: 0, HUB_ADMIN: 1, STATE_ADMIN: 2, SUPER_ADMIN: 3 } as const;
type Role = keyof typeof roleRank;

async function actor(id: number) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!user || user.role === "USER") return null;
  const stateScopes = await db.select().from(adminStateScopesTable).where(eq(adminStateScopesTable.userId, id));
  const hubScopes = await db.select().from(adminHubScopesTable).where(eq(adminHubScopesTable.userId, id));
  return { ...user, stateIds: stateScopes.map(x => x.stateId), hubIds: hubScopes.map(x => x.hubId) };
}
function mayCreate(actorRole: Role, targetRole: Role) {
  return roleRank[actorRole] > roleRank[targetRole];
}
function normalizeBgStatus(value: unknown) {
  const v = String(value ?? "").toUpperCase();
  if (v.includes("PASS") || v === "GREEN") return "PASSED" as const;
  if (v.includes("FAIL") || v === "RED") return "FAILED" as const;
  if (v.includes("PROGRESS")) return "IN_PROGRESS" as const;
  if (v.includes("REVIEW") || v === "AMBER") return "REVIEW_REQUIRED" as const;
  return "PENDING" as const;
}
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []; let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"' && quoted && text[i + 1] === '"') { cell += '"'; i++; }
    else if (c === '"') quoted = !quoted;
    else if (c === "," && !quoted) { row.push(cell); cell = ""; }
    else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); if (row.some(Boolean)) rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const headers = rows.shift() ?? [];
  return rows.map(values => Object.fromEntries(headers.map((h, i) => [h.trim(), values[i] ?? ""])));
}

router.get("/organization/bootstrap", requireAuth, async (req, res): Promise<void> => {
  const me = await actor(req.adminUserId!);
  if (!me) { res.status(403).json({ error: "Admin access required" }); return; }
  const allStates = await db.select().from(statesTable).where(eq(statesTable.customerId, me.customerId));
  const allHubs = await db.select().from(hubsTable).where(eq(hubsTable.customerId, me.customerId));
  const allVehicles = await db.select().from(vehiclesTable).where(eq(vehiclesTable.customerId, me.customerId));
  const states = me.role === "SUPER_ADMIN" ? allStates : allStates.filter(s => me.stateIds.includes(s.id));
  const hubs = me.role === "SUPER_ADMIN" ? allHubs : me.role === "STATE_ADMIN"
    ? allHubs.filter(h => h.stateId != null && me.stateIds.includes(h.stateId)) : allHubs.filter(h => me.hubIds.includes(h.id));
  const vehicles = me.role === "SUPER_ADMIN" ? allVehicles : allVehicles.filter(v => v.hubId != null && hubs.some(h => h.id === v.hubId));
  res.json({ me, states, hubs, vehicles, creatableRoles: (Object.keys(roleRank) as Role[]).filter(r => mayCreate(me.role as Role, r)) });
});

router.post("/organization/states", requireAuth, async (req, res): Promise<void> => {
  const me = await actor(req.adminUserId!);
  if (!me || me.role !== "SUPER_ADMIN") { res.status(403).json({ error: "Only Super Admin can create states" }); return; }
  const body = z.object({ name: z.string().min(2), code: z.string().min(2).max(32) }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const created = await insertReturning(statesTable, { ...body.data, customerId: me.customerId });
  res.status(201).json(created);
});

router.patch("/organization/states/:id", requireAuth, async (req, res): Promise<void> => {
  const me = await actor(req.adminUserId!);
  if (!me || me.role !== "SUPER_ADMIN") { res.status(403).json({ error: "Only Super Admin can update states" }); return; }
  const stateId = Number(req.params.id);
  if (!Number.isInteger(stateId) || stateId <= 0) { res.status(400).json({ error: "Invalid state ID" }); return; }
  const body = z.object({
    name: z.string().min(2).optional(),
    code: z.string().min(2).max(32).optional(),
    active: z.boolean().optional(),
  }).refine(value => Object.keys(value).length > 0, { message: "At least one field is required" }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const [state] = await db.select().from(statesTable).where(and(
    eq(statesTable.id, stateId),
    eq(statesTable.customerId, me.customerId),
  )).limit(1);
  if (!state) { res.status(404).json({ error: "State not found" }); return; }
  await db.update(statesTable).set(body.data).where(eq(statesTable.id, state.id));
  const [updated] = await db.select().from(statesTable).where(eq(statesTable.id, state.id)).limit(1);
  res.json(updated);
});

router.post("/organization/vehicles", requireAuth, async (req, res): Promise<void> => {
  const me = await actor(req.adminUserId!);
  if (!me) { res.status(403).json({ error: "Admin access required" }); return; }
  const body = z.object({
    hubId: z.number().int().positive(), registrationNumber: z.string().min(2), vehicleType: z.string().default("TWO_WHEELER"),
    make: z.string().nullable().optional(), model: z.string().nullable().optional(), color: z.string().nullable().optional(),
    chassisNumber: z.string().nullable().optional(), engineNumber: z.string().nullable().optional(),
    imei: z.string().nullable().optional(), iotVendor: z.string().nullable().optional(),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  if (me.role === "HUB_ADMIN" && !me.hubIds.includes(body.data.hubId)) { res.status(403).json({ error: "Hub is outside your scope" }); return; }
  const created = await insertReturning(vehiclesTable, { ...body.data, customerId: me.customerId });
  res.status(201).json(created);
});

router.patch("/organization/vehicles/:id", requireAuth, async (req, res): Promise<void> => {
  const me = await actor(req.adminUserId!);
  const vehicleId = Number(req.params.id);
  const body = z.object({
    hubId: z.number().int().positive().nullable().optional(),
    registrationNumber: z.string().min(2).optional(),
    vehicleType: z.string().optional(),
    make: z.string().nullable().optional(), model: z.string().nullable().optional(),
    color: z.string().nullable().optional(), chassisNumber: z.string().nullable().optional(),
    engineNumber: z.string().nullable().optional(), imei: z.string().nullable().optional(),
    iotVendor: z.string().nullable().optional(),
    status: z.enum(["AVAILABLE", "ASSIGNED", "MAINTENANCE", "INACTIVE"]).optional(),
    active: z.boolean().optional(),
  }).safeParse(req.body);
  if (!me || !Number.isInteger(vehicleId) || !body.success) {
    res.status(!me ? 403 : !Number.isInteger(vehicleId) ? 400 : 400).json({ error: !me ? "Admin access required" : !body.success ? body.error.message : "Invalid vehicle ID" }); return;
  }
  const [vehicle] = await db.select().from(vehiclesTable).where(and(eq(vehiclesTable.id, vehicleId), eq(vehiclesTable.customerId, me.customerId))).limit(1);
  if (!vehicle) { res.status(404).json({ error: "Vehicle not found" }); return; }
  const targetHubId = body.data.hubId === undefined ? vehicle.hubId : body.data.hubId;
  if (me.role === "HUB_ADMIN" && (targetHubId == null || !me.hubIds.includes(targetHubId))) { res.status(403).json({ error: "Hub is outside your scope" }); return; }
  if (me.role === "STATE_ADMIN" && targetHubId != null) {
    const [hub] = await db.select().from(hubsTable).where(and(eq(hubsTable.id, targetHubId), eq(hubsTable.customerId, me.customerId))).limit(1);
    if (!hub || hub.stateId == null || !me.stateIds.includes(hub.stateId)) { res.status(403).json({ error: "Hub is outside your scope" }); return; }
  }
  await db.update(vehiclesTable).set(body.data).where(eq(vehiclesTable.id, vehicle.id));
  const [updated] = await db.select().from(vehiclesTable).where(eq(vehiclesTable.id, vehicle.id)).limit(1);
  res.json(updated);
});

const createPersonBody = z.object({
  role: z.enum(["SUPER_ADMIN", "STATE_ADMIN", "HUB_ADMIN", "USER"]),
  firstName: z.string().min(2), lastName: z.string().min(1), gender: z.enum(["MALE", "FEMALE", "OTHER"]),
  employeeCode: z.string().min(2), phoneNumber: z.string().min(8), email: z.string().email(),
  stateIds: z.array(z.number().int().positive()).default([]), hubIds: z.array(z.number().int().positive()).default([]),
  hubId: z.number().int().positive().nullable().optional(), vehicleId: z.number().int().positive().nullable().optional(),
  flipkartId: z.string().nullable().optional(),
});
router.post("/hierarchy/users", requireAuth, async (req, res): Promise<void> => {
  const me = await actor(req.adminUserId!);
  const body = createPersonBody.safeParse(req.body);
  if (!me || !body.success) { res.status(!me ? 403 : 400).json({ error: body.success ? "Admin access required" : body.error.message }); return; }
  if (!mayCreate(me.role as Role, body.data.role)) { res.status(403).json({ error: `${me.role} cannot create ${body.data.role}` }); return; }
  const requestedStateIds = body.data.stateIds;
  const requestedHubIds = body.data.hubIds.length ? body.data.hubIds : body.data.hubId ? [body.data.hubId] : [];
  if (me.role === "STATE_ADMIN" && requestedStateIds.some(id => !me.stateIds.includes(id))) { res.status(403).json({ error: "State is outside your scope" }); return; }
  if (me.role === "HUB_ADMIN" && requestedHubIds.some(id => !me.hubIds.includes(id))) { res.status(403).json({ error: "Hub is outside your scope" }); return; }
  const duplicateConditions = [
    eq(usersTable.email, body.data.email.trim().toLowerCase()),
    eq(usersTable.employeeCode, body.data.employeeCode.trim()),
  ];
  if (body.data.flipkartId) duplicateConditions.push(eq(usersTable.flipkartId, body.data.flipkartId.trim()));
  const [duplicate] = await db.select().from(usersTable).where(and(
    eq(usersTable.customerId, me.customerId),
    isNull(usersTable.deletedAt),
    or(...duplicateConditions),
  )).limit(1);
  if (duplicate) {
    res.status(409).json({ error: "An active account already uses this email, employee code, or Flipkart/FHR ID" });
    return;
  }
  const user = await insertReturning(usersTable, {
    customerId: me.customerId, parentUserId: me.id, firstName: body.data.firstName, lastName: body.data.lastName,
    gender: body.data.gender, employeeCode: body.data.employeeCode, phoneNumber: body.data.phoneNumber,
    email: body.data.email.trim().toLowerCase(), role: body.data.role, status: "ACTIVE",
    stateId: requestedStateIds[0] ?? null, hubId: requestedHubIds[0] ?? null,
    vehicleId: body.data.vehicleId ?? null, flipkartId: body.data.flipkartId ?? null,
  });
  if (requestedStateIds.length) await db.insert(adminStateScopesTable).values(requestedStateIds.map(stateId => ({ userId: user.id, stateId })));
  if (requestedHubIds.length) await db.insert(adminHubScopesTable).values(requestedHubIds.map(hubId => ({ userId: user.id, hubId })));
  if (body.data.vehicleId) await db.update(vehiclesTable).set({ status: "ASSIGNED" }).where(eq(vehiclesTable.id, body.data.vehicleId));
  const temporaryPassword = DEFAULT_USER_PASSWORD;
  await db.insert(credentialsTable).values({ userId: user.id, username: user.employeeCode, passwordHash: await bcrypt.hash(temporaryPassword, 10) });
  let onboardingLink: string | null = null;
  if (user.role === "USER") {
    const token = uuidv4(); onboardingLink = `/onboarding/${token}`;
    await db.insert(onboardingInvitesTable).values({ userId: user.id, token, channel: "EMAIL", deepLink: onboardingLink });
  }
  // The account already exists at this point, so a bounced welcome email must
  // not fail the request — it is reported back instead.
  let welcomeEmailSent = true;
  try {
    await sendWelcomeEmail({
      to: user.email,
      recipientName: user.firstName,
      loginEmail: user.email,
      password: temporaryPassword,
      loginUrl: loginUrl(),
      resetUrl: passwordResetRequestUrl(),
      role: ROLE_LABELS[user.role] ?? user.role,
      mobileAppUrl: user.role === "USER" ? mobileAppUrl() : undefined,
    });
  } catch (error) {
    welcomeEmailSent = false;
    req.log.error({ err: error, userId: user.id }, "Failed to send welcome email");
  }
  res.status(201).json({ user, onboardingLink, temporaryPassword, welcomeEmailSent });
});

router.get("/hierarchy/users", requireAuth, async (req, res): Promise<void> => {
  const me = await actor(req.adminUserId!);
  if (!me) { res.status(403).json({ error: "Admin access required" }); return; }
  const requestedRole = z.enum(["SUPER_ADMIN", "STATE_ADMIN", "HUB_ADMIN", "USER"]).optional().safeParse(req.query.role);
  let rows = await db.select().from(usersTable).where(and(eq(usersTable.customerId, me.customerId), isNull(usersTable.deletedAt))).orderBy(desc(usersTable.createdAt));
  rows = rows.filter(u => roleRank[u.role] < roleRank[me.role as Role] || u.id === me.id);
  if (me.role === "STATE_ADMIN") rows = rows.filter(u => u.stateId != null && me.stateIds.includes(u.stateId));
  if (me.role === "HUB_ADMIN") rows = rows.filter(u => u.hubId != null && me.hubIds.includes(u.hubId));
  if (requestedRole.success && requestedRole.data) rows = rows.filter(u => u.role === requestedRole.data);
  const enriched = await Promise.all(rows.map(async user => {
    const stateScopes = await db.select().from(adminStateScopesTable).where(eq(adminStateScopesTable.userId, user.id));
    const hubScopes = await db.select().from(adminHubScopesTable).where(eq(adminHubScopesTable.userId, user.id));
    return { ...user, stateIds: stateScopes.map(scope => scope.stateId), hubIds: hubScopes.map(scope => scope.hubId) };
  }));
  res.json(enriched);
});

router.patch("/hierarchy/users/:id", requireAuth, async (req, res): Promise<void> => {
  const me = await actor(req.adminUserId!);
  const targetId = Number(req.params.id);
  const body = createPersonBody.omit({ role: true }).extend({
    status: z.enum(["INVITED", "ACTIVE", "SUSPENDED"]).optional(),
  }).safeParse(req.body);
  if (!me || !Number.isInteger(targetId) || !body.success) {
    res.status(!me ? 403 : 400).json({ error: !me ? "Admin access required" : !body.success ? body.error.message : "Invalid user ID" }); return;
  }
  const [target] = await db.select().from(usersTable).where(and(eq(usersTable.id, targetId), eq(usersTable.customerId, me.customerId), isNull(usersTable.deletedAt))).limit(1);
  if (!target) { res.status(404).json({ error: "User not found" }); return; }
  const mayEditPeerSuperAdmin = me.role === "SUPER_ADMIN" && target.role === "SUPER_ADMIN";
  if (!mayCreate(me.role as Role, target.role) && !mayEditPeerSuperAdmin && target.id !== me.id) { res.status(403).json({ error: `You cannot edit a ${target.role} account` }); return; }
  const requestedStateIds = body.data.stateIds;
  const requestedHubIds = body.data.hubIds.length ? body.data.hubIds : body.data.hubId ? [body.data.hubId] : [];
  if (me.role === "STATE_ADMIN" && requestedStateIds.some(id => !me.stateIds.includes(id))) { res.status(403).json({ error: "State is outside your scope" }); return; }
  if (me.role === "HUB_ADMIN" && requestedHubIds.some(id => !me.hubIds.includes(id))) { res.status(403).json({ error: "Hub is outside your scope" }); return; }
  const possibleDuplicates = await db.select().from(usersTable).where(and(eq(usersTable.customerId, me.customerId), isNull(usersTable.deletedAt), or(
    eq(usersTable.email, body.data.email.trim().toLowerCase()),
    eq(usersTable.employeeCode, body.data.employeeCode.trim()),
    ...(body.data.flipkartId ? [eq(usersTable.flipkartId, body.data.flipkartId.trim())] : []),
  )));
  if (possibleDuplicates.some(user => user.id !== target.id)) { res.status(409).json({ error: "Another account already uses this email, employee code, or Flipkart/FHR ID" }); return; }
  await db.transaction(async tx => {
    if (target.vehicleId && target.vehicleId !== body.data.vehicleId) await tx.update(vehiclesTable).set({ status: "AVAILABLE" }).where(eq(vehiclesTable.id, target.vehicleId));
    await tx.update(usersTable).set({
      firstName: body.data.firstName, lastName: body.data.lastName, gender: body.data.gender,
      employeeCode: body.data.employeeCode, phoneNumber: body.data.phoneNumber,
      email: body.data.email.trim().toLowerCase(), stateId: requestedStateIds[0] ?? null,
      hubId: requestedHubIds[0] ?? null, vehicleId: body.data.vehicleId ?? null,
      flipkartId: body.data.flipkartId ?? null, ...(body.data.status ? { status: body.data.status } : {}),
    }).where(eq(usersTable.id, target.id));
    await tx.delete(adminStateScopesTable).where(eq(adminStateScopesTable.userId, target.id));
    await tx.delete(adminHubScopesTable).where(eq(adminHubScopesTable.userId, target.id));
    if (requestedStateIds.length) await tx.insert(adminStateScopesTable).values(requestedStateIds.map(stateId => ({ userId: target.id, stateId })));
    if (requestedHubIds.length) await tx.insert(adminHubScopesTable).values(requestedHubIds.map(hubId => ({ userId: target.id, hubId })));
    if (body.data.vehicleId) await tx.update(vehiclesTable).set({ status: "ASSIGNED" }).where(eq(vehiclesTable.id, body.data.vehicleId));
  });
  res.json({ updated: true });
});

// Deletion is permanent: the account and its tracking history are removed from
// the database rather than tombstoned, so nothing lingers in the user lists.
router.delete("/hierarchy/users/:id", requireAuth, async (req, res): Promise<void> => {
  const me = await actor(req.adminUserId!);
  const targetId = Number(req.params.id);
  if (!me || !Number.isInteger(targetId)) { res.status(!me ? 403 : 400).json({ error: !me ? "Admin access required" : "Invalid user id" }); return; }
  if (targetId === me.id) { res.status(400).json({ error: "You cannot delete your own account" }); return; }
  // Accounts tombstoned by the previous soft-delete are still deletable here.
  const [target] = await db.select().from(usersTable).where(and(eq(usersTable.id, targetId), eq(usersTable.customerId, me.customerId)));
  if (!target) { res.status(404).json({ error: "User not found" }); return; }
  const mayDeletePeerSuperAdmin = me.role === "SUPER_ADMIN" && target.role === "SUPER_ADMIN";
  if (!mayCreate(me.role as Role, target.role) && !mayDeletePeerSuperAdmin) {
    res.status(403).json({ error: `You cannot delete a ${target.role} account` });
    return;
  }
  if (me.role === "STATE_ADMIN" && (target.stateId == null || !me.stateIds.includes(target.stateId))) { res.status(403).json({ error: "User is outside your state scope" }); return; }
  if (me.role === "HUB_ADMIN" && (target.hubId == null || !me.hubIds.includes(target.hubId))) { res.status(403).json({ error: "User is outside your hub scope" }); return; }
  await db.transaction(async tx => { await purgeUser(tx, target); });
  res.sendStatus(204);
});

router.get("/verifications", requireAuth, async (req, res): Promise<void> => {
  const me = await actor(req.adminUserId!);
  if (!me) { res.status(403).json({ error: "Admin access required" }); return; }
  let rows = await db.select().from(backgroundVerificationsTable).where(eq(backgroundVerificationsTable.customerId, me.customerId)).orderBy(desc(backgroundVerificationsTable.updatedAt));
  if (me.role === "STATE_ADMIN") rows = rows.filter(r => !r.stateName || me.stateIds.length > 0);
  if (me.role === "HUB_ADMIN") {
    const hubs = await db.select().from(hubsTable).where(inArray(hubsTable.id, me.hubIds.length ? me.hubIds : [-1]));
    rows = rows.filter(r => hubs.some(h => h.name.toLowerCase() === r.hubName?.toLowerCase()));
  }
  res.json(rows);
});

router.patch("/verifications/:id", requireAuth, async (req, res): Promise<void> => {
  const me = await actor(req.adminUserId!);
  const verificationId = Number(req.params.id);
  const body = z.object({
    employeeId: z.string().min(1), profileId: z.string().nullable().optional(),
    hubName: z.string().nullable().optional(), stateName: z.string().nullable().optional(),
    nidStatus: z.string().nullable().optional(), crcStatus: z.string().nullable().optional(),
    nidRemarks: z.string().nullable().optional(), crcRemarks: z.string().nullable().optional(),
    status: z.enum(["NOT_STARTED", "PENDING", "IN_PROGRESS", "PASSED", "FAILED", "REVIEW_REQUIRED"]),
  }).safeParse(req.body);
  if (!me || !Number.isInteger(verificationId) || !body.success) {
    res.status(!me ? 403 : 400).json({ error: !me ? "Admin access required" : !body.success ? body.error.message : "Invalid verification ID" }); return;
  }
  const [record] = await db.select().from(backgroundVerificationsTable).where(and(eq(backgroundVerificationsTable.id, verificationId), eq(backgroundVerificationsTable.customerId, me.customerId))).limit(1);
  if (!record) { res.status(404).json({ error: "Verification record not found" }); return; }
  if (me.role === "HUB_ADMIN") {
    const hubs = await db.select().from(hubsTable).where(inArray(hubsTable.id, me.hubIds.length ? me.hubIds : [-1]));
    if (!hubs.some(hub => hub.name.toLowerCase() === (body.data.hubName ?? record.hubName ?? "").toLowerCase())) { res.status(403).json({ error: "Verification is outside your hub scope" }); return; }
  }
  const [user] = await db.select().from(usersTable).where(and(eq(usersTable.customerId, me.customerId), eq(usersTable.flipkartId, body.data.employeeId))).limit(1);
  await db.update(backgroundVerificationsTable).set({ ...body.data, userId: user?.id ?? null, source: "MANUAL", updatedAt: new Date() }).where(eq(backgroundVerificationsTable.id, record.id));
  const [updated] = await db.select().from(backgroundVerificationsTable).where(eq(backgroundVerificationsTable.id, record.id)).limit(1);
  res.json(updated);
});

router.post("/verifications/import", requireAuth, async (req, res): Promise<void> => {
  const me = await actor(req.adminUserId!);
  const body = z.object({ fileName: z.string(), base64: z.string() }).safeParse(req.body);
  if (!me || !body.success) { res.status(!me ? 403 : 400).json({ error: body.success ? "Admin access required" : body.error.message }); return; }
  const job = await insertReturning(importJobsTable, { customerId: me.customerId, uploadedByUserId: me.id, type: "BGV", fileName: body.data.fileName, source: "SHEET", status: "PROCESSING" });
  try {
    const workbook = XLSX.read(Buffer.from(body.data.base64, "base64"));
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[workbook.SheetNames[0]], { defval: "" });
    let success = 0; const warnings: string[] = [];
    for (const row of rows) {
      const employeeId = String(row["Employee ID"] ?? "").trim();
      if (!employeeId) { warnings.push("Row without Employee ID skipped"); continue; }
      const [user] = await db.select().from(usersTable).where(and(eq(usersTable.customerId, me.customerId), eq(usersTable.flipkartId, employeeId))).limit(1);
      const value = {
        customerId: me.customerId, userId: user?.id, employeeId, profileId: String(row["Profile_id"] ?? "") || null,
        vendorName: String(row["VENDOR NAME"] ?? "") || null, hubName: String(row["Hub"] ?? "") || null,
        stateName: String(row["State"] ?? "") || null, nidStatus: String(row["NID Status"] ?? "") || null,
        crcStatus: String(row["CRC Status"] ?? "") || null, nidRemarks: String(row["NID Remarks"] ?? "") || null,
        crcRemarks: String(row["CRC Remarks"] ?? "") || null, status: normalizeBgStatus(row["Status"]),
        vehicleStatus: String(row["Vehicle Status"] ?? "") || null, vehicleProvider: String(row["__EMPTY"] ?? "") || null,
        source: "SHEET" as const, rawData: row, updatedAt: new Date(),
      };
      const [existing] = await db.select().from(backgroundVerificationsTable).where(and(eq(backgroundVerificationsTable.customerId, me.customerId), eq(backgroundVerificationsTable.employeeId, employeeId))).limit(1);
      if (existing) await db.update(backgroundVerificationsTable).set(value).where(eq(backgroundVerificationsTable.id, existing.id));
      else await db.insert(backgroundVerificationsTable).values(value);
      success++;
    }
    await db.update(importJobsTable).set({ status: warnings.length ? "COMPLETED_WITH_WARNINGS" : "COMPLETED", totalRows: rows.length, successfulRows: success, failedRows: rows.length - success, warnings, completedAt: new Date() }).where(eq(importJobsTable.id, job.id));
    res.json({ jobId: job.id, totalRows: rows.length, successfulRows: success, warnings });
  } catch (error) {
    await db.update(importJobsTable).set({ status: "FAILED", warnings: [String(error)], completedAt: new Date() }).where(eq(importJobsTable.id, job.id));
    res.status(400).json({ error: "Unable to read verification workbook" });
  }
});

router.post("/verifications/api", requireAuth, async (req, res): Promise<void> => {
  const me = await actor(req.adminUserId!);
  const body = z.object({ employeeId: z.string(), profileId: z.string().optional(), nidStatus: z.string().optional(), crcStatus: z.string().optional(), nidRemarks: z.string().optional(), crcRemarks: z.string().optional(), status: z.string(), externalReference: z.string().optional(), rawData: z.unknown().optional() }).safeParse(req.body);
  if (!me || !body.success) { res.status(!me ? 403 : 400).json({ error: body.success ? "Admin access required" : body.error.message }); return; }
  const [user] = await db.select().from(usersTable).where(and(eq(usersTable.customerId, me.customerId), eq(usersTable.flipkartId, body.data.employeeId))).limit(1);
  await db.insert(backgroundVerificationsTable).values({ customerId: me.customerId, userId: user?.id, employeeId: body.data.employeeId, profileId: body.data.profileId, nidStatus: body.data.nidStatus, crcStatus: body.data.crcStatus, nidRemarks: body.data.nidRemarks, crcRemarks: body.data.crcRemarks, status: normalizeBgStatus(body.data.status), source: "API", externalReference: body.data.externalReference, rawData: body.data.rawData });
  res.status(201).json({ accepted: true });
});

router.post("/deliveries/import", requireAuth, async (req, res): Promise<void> => {
  const me = await actor(req.adminUserId!);
  const body = z.object({ fileName: z.string(), base64: z.string() }).safeParse(req.body);
  if (!me || !body.success) { res.status(!me ? 403 : 400).json({ error: body.success ? "Admin access required" : body.error.message }); return; }
  const rows = parseCsv(Buffer.from(body.data.base64, "base64").toString("utf8"));
  const job = await insertReturning(importJobsTable, { customerId: me.customerId, uploadedByUserId: me.id, type: "DELIVERY", fileName: body.data.fileName, source: "SHEET", status: "PROCESSING", totalRows: rows.length });
  if (!rows[0]?.FHRID || !rows[0]?.ShipmentId) {
    await db.update(importJobsTable).set({ status: "COMPLETED_WITH_WARNINGS", warnings: ["Aggregated/pivot CSV detected. Shipment-level columns FHRID and ShipmentId are required."], failedRows: rows.length, completedAt: new Date() }).where(eq(importJobsTable.id, job.id));
    res.status(422).json({ error: "This is an aggregated report. Upload the shipment-level BigQuery CSV.", jobId: job.id }); return;
  }
  let matched = 0;
  for (const row of rows) {
    const fhrId = row.FHRID.replace(/\\.0+$/, "");
    const [user] = await db.select().from(usersTable).where(and(eq(usersTable.customerId, me.customerId), eq(usersTable.flipkartId, fhrId))).limit(1);
    if (user) matched++;
    await db.insert(deliveryRecordsTable).values({
      customerId: me.customerId, importJobId: job.id, userId: user?.id, fhrId, runsheetId: row.RunsheetId,
      shipmentId: row.ShipmentId, agentName: row.AgentName, deliveryHub: row.DeliveryHub, city: row.City, zone: row.Zone,
      state: row.State, shipmentStatus: row.ShipmentStatus, runsheetShipmentStatus: row.RunsheetShipmentStatus,
      shipmentType: row.ShipmentType, shipmentPrice: Number(row.ShipmentPrice) || null, shipmentWeight: Number(row.ShipmentWeight) || null,
      shipmentUpdatedAt: row.ShipmentUpdateDateTime ? new Date(row.ShipmentUpdateDateTime) : null, rawData: row,
    });
  }
  const warnings = matched < rows.length ? [`${rows.length - matched} rows could not be matched to a rider Flipkart ID`] : [];
  await db.update(importJobsTable).set({ status: warnings.length ? "COMPLETED_WITH_WARNINGS" : "COMPLETED", successfulRows: rows.length, warnings, completedAt: new Date() }).where(eq(importJobsTable.id, job.id));
  res.json({ jobId: job.id, totalRows: rows.length, matchedRows: matched, warnings });
});

router.get("/deliveries/summary", requireAuth, async (req, res): Promise<void> => {
  const me = await actor(req.adminUserId!);
  if (!me) { res.status(403).json({ error: "Admin access required" }); return; }
  const rows = await db.select({ status: deliveryRecordsTable.shipmentStatus, count: sql<number>`count(*)` }).from(deliveryRecordsTable).where(eq(deliveryRecordsTable.customerId, me.customerId)).groupBy(deliveryRecordsTable.shipmentStatus);
  res.json(rows);
});

export default router;
