import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import { db } from "@workspace/db";
import {
  usersTable,
  addressesTable,
  markedPlacesTable,
  credentialsTable,
  onboardingInvitesTable,
  emergencyAlertsTable,
} from "@workspace/db";
import {
  ListUsersQueryParams,
  ListUsersResponse,
  CreateUserBody,
  CreateUserResponse,
  GetUserParams,
  GetUserResponse,
  UpdateUserParams,
  UpdateUserBody,
  UpdateUserResponse,
  GetOnboardingInviteParams,
  GetOnboardingInviteResponse,
  TriggerEmergencyAlertParams,
  TriggerEmergencyAlertBody,
  TriggerEmergencyAlertResponse,
  ListUserAlertsParams,
  ListUserAlertsResponse,
  ListMarkedPlacesParams,
  ListMarkedPlacesResponse,
  CreateMarkedPlaceParams,
  CreateMarkedPlaceBody,
  CreateMarkedPlaceResponse,
  DeleteMarkedPlaceParams,
} from "@workspace/api-zod";
import { requireAuth } from "../../middlewares/auth.js";
import { randomDelhiNcrCoord } from "../../lib/geo.js";

const router: IRouter = Router();


// GET /users
router.get("/users", requireAuth, async (req, res): Promise<void> => {
  const q = ListUsersQueryParams.safeParse(req.query);
  if (!q.success) {
    res.status(400).json({ error: q.error.message });
    return;
  }

  const adminUser = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, req.adminUserId!),
  });
  if (!adminUser) { res.status(401).json({ error: "Admin not found" }); return; }

  let query = db.select().from(usersTable).where(eq(usersTable.customerId, adminUser.customerId)).$dynamic();

  const conditions = [eq(usersTable.customerId, adminUser.customerId)];
  if (q.data.role) conditions.push(eq(usersTable.role, q.data.role));
  if (q.data.status) conditions.push(eq(usersTable.status, q.data.status));

  const users = await db.select().from(usersTable).where(and(...conditions));
  res.json(ListUsersResponse.parse(users));
});

// POST /users
router.post("/users", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const adminUser = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, req.adminUserId!),
  });
  if (!adminUser) { res.status(401).json({ error: "Admin not found" }); return; }

  const { addresses, markedPlaces, ...userFields } = parsed.data;

  let geocodeWarnLogged = false;
  const warnGeocode = () => {
    if (!geocodeWarnLogged) {
      req.log.warn("Geocoding is stubbed — using random Delhi NCR coordinates until GOOGLE_MAPS_SERVER_KEY is configured");
      geocodeWarnLogged = true;
    }
  };

  const [user] = await db
    .insert(usersTable)
    .values({ ...userFields, customerId: adminUser.customerId })
    .returning();

  // Insert addresses with stub geocoding
  if (addresses.length > 0) {
    warnGeocode();
    for (const addr of addresses) {
      const { lat, lng } = randomDelhiNcrCoord();
      await db.insert(addressesTable).values({
        userId: user.id,
        type: addr.type,
        rawAddress: addr.rawAddress,
        latitude: lat,
        longitude: lng,
      });
    }
  }

  // Insert marked places with stub geocoding
  if (markedPlaces && markedPlaces.length > 0) {
    warnGeocode();
    for (const mp of markedPlaces) {
      const { lat, lng } = randomDelhiNcrCoord();
      await db.insert(markedPlacesTable).values({
        userId: user.id,
        label: mp.label,
        rawAddress: mp.rawAddress,
        latitude: lat,
        longitude: lng,
      });
    }
  }

  let onboardingInvite = null;
  if (user.role === "USER") {
    // Create credentials (stub password)
    const tempPassword = uuidv4().slice(0, 12);
    const passwordHash = await bcrypt.hash(tempPassword, 10);
    await db.insert(credentialsTable).values({
      userId: user.id,
      username: user.employeeCode,
      passwordHash,
    });

    // Create onboarding invite
    const token = uuidv4();
    const [invite] = await db
      .insert(onboardingInvitesTable)
      .values({
        userId: user.id,
        token,
        channel: "EMAIL",
        deepLink: `/onboarding/${token}`,
      })
      .returning();
    onboardingInvite = invite;
  }

  res.status(201).json(CreateUserResponse.parse({ user, onboardingInvite }));
});

// GET /users/:id
router.get("/users/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetUserParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const adminUser = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, req.adminUserId!),
  });
  if (!adminUser) { res.status(401).json({ error: "Admin not found" }); return; }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(and(eq(usersTable.id, params.data.id), eq(usersTable.customerId, adminUser.customerId)));

  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const userAddresses = await db
    .select()
    .from(addressesTable)
    .where(eq(addressesTable.userId, user.id));

  const userMarkedPlaces = await db
    .select()
    .from(markedPlacesTable)
    .where(eq(markedPlacesTable.userId, user.id));

  res.json(GetUserResponse.parse({ ...user, addresses: userAddresses, markedPlaces: userMarkedPlaces }));
});

// PATCH /users/:id
router.patch("/users/:id", requireAuth, async (req, res): Promise<void> => {
  const params = UpdateUserParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const body = UpdateUserBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const adminUser = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, req.adminUserId!),
  });
  if (!adminUser) { res.status(401).json({ error: "Admin not found" }); return; }

  const [user] = await db
    .update(usersTable)
    .set(body.data)
    .where(and(eq(usersTable.id, params.data.id), eq(usersTable.customerId, adminUser.customerId)))
    .returning();

  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  res.json(UpdateUserResponse.parse(user));
});

// GET /users/:id/onboarding-invite
router.get("/users/:id/onboarding-invite", requireAuth, async (req, res): Promise<void> => {
  const params = GetOnboardingInviteParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const adminUser = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, req.adminUserId!),
  });
  if (!adminUser) { res.status(401).json({ error: "Admin not found" }); return; }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(and(eq(usersTable.id, params.data.id), eq(usersTable.customerId, adminUser.customerId)));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  let [invite] = await db
    .select()
    .from(onboardingInvitesTable)
    .where(eq(onboardingInvitesTable.userId, user.id));

  if (!invite) {
    const token = uuidv4();
    [invite] = await db
      .insert(onboardingInvitesTable)
      .values({ userId: user.id, token, channel: "EMAIL", deepLink: `/onboarding/${token}` })
      .returning();
  }

  res.json(GetOnboardingInviteResponse.parse(invite));
});

// POST /users/:id/emergency-alert
router.post("/users/:id/emergency-alert", requireAuth, async (req, res): Promise<void> => {
  const params = TriggerEmergencyAlertParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const body = TriggerEmergencyAlertBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const adminUser = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, req.adminUserId!),
  });
  if (!adminUser) { res.status(401).json({ error: "Admin not found" }); return; }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(and(eq(usersTable.id, params.data.id), eq(usersTable.customerId, adminUser.customerId)));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const [alert] = await db
    .insert(emergencyAlertsTable)
    .values({
      userId: user.id,
      triggeredByAdminId: adminUser.id,
      message: body.data.message ?? null,
      acknowledgedAt: null,
    })
    .returning();

  res.status(201).json(TriggerEmergencyAlertResponse.parse({ ...alert, message: alert.message ?? "" }));
});

// GET /users/:id/alerts
router.get("/users/:id/alerts", requireAuth, async (req, res): Promise<void> => {
  const params = ListUserAlertsParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const adminUser = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, req.adminUserId!),
  });
  if (!adminUser) { res.status(401).json({ error: "Admin not found" }); return; }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(and(eq(usersTable.id, params.data.id), eq(usersTable.customerId, adminUser.customerId)));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const alerts = await db
    .select()
    .from(emergencyAlertsTable)
    .where(eq(emergencyAlertsTable.userId, user.id));

  res.json(ListUserAlertsResponse.parse(alerts.map(a => ({ ...a, message: a.message ?? "" }))));
});

// GET /users/:id/marked-places
router.get("/users/:id/marked-places", requireAuth, async (req, res): Promise<void> => {
  const params = ListMarkedPlacesParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const adminUser = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, req.adminUserId!),
  });
  if (!adminUser) { res.status(401).json({ error: "Admin not found" }); return; }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(and(eq(usersTable.id, params.data.id), eq(usersTable.customerId, adminUser.customerId)));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const places = await db
    .select()
    .from(markedPlacesTable)
    .where(eq(markedPlacesTable.userId, user.id));

  res.json(ListMarkedPlacesResponse.parse(places));
});

// POST /users/:id/marked-places
router.post("/users/:id/marked-places", requireAuth, async (req, res): Promise<void> => {
  const params = CreateMarkedPlaceParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const body = CreateMarkedPlaceBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const adminUser = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, req.adminUserId!),
  });
  if (!adminUser) { res.status(401).json({ error: "Admin not found" }); return; }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(and(eq(usersTable.id, params.data.id), eq(usersTable.customerId, adminUser.customerId)));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  req.log.warn("Geocoding is stubbed — using random Delhi NCR coordinates until GOOGLE_MAPS_SERVER_KEY is configured");
  const { lat, lng } = randomDelhiNcrCoord();

  const [place] = await db
    .insert(markedPlacesTable)
    .values({ userId: user.id, label: body.data.label, rawAddress: body.data.rawAddress, latitude: lat, longitude: lng })
    .returning();

  res.status(201).json(CreateMarkedPlaceResponse.parse(place));
});

// DELETE /marked-places/:placeId
router.delete("/marked-places/:placeId", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteMarkedPlaceParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const adminUser = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, req.adminUserId!),
  });
  if (!adminUser) { res.status(401).json({ error: "Admin not found" }); return; }

  // Verify ownership via join
  const [place] = await db
    .select({ id: markedPlacesTable.id, userId: markedPlacesTable.userId })
    .from(markedPlacesTable)
    .where(eq(markedPlacesTable.id, params.data.placeId));

  if (!place) { res.status(404).json({ error: "Marked place not found" }); return; }

  const [owner] = await db
    .select()
    .from(usersTable)
    .where(and(eq(usersTable.id, place.userId), eq(usersTable.customerId, adminUser.customerId)));
  if (!owner) { res.status(403).json({ error: "Forbidden" }); return; }

  await db.delete(markedPlacesTable).where(eq(markedPlacesTable.id, params.data.placeId));
  res.sendStatus(204);
});

export default router;
