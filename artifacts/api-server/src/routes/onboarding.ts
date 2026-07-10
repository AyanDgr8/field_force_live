import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, updateReturning } from "@workspace/db";
import { onboardingInvitesTable, usersTable } from "@workspace/db";
import {
  GetOnboardingByTokenParams,
  GetOnboardingByTokenResponse,
  SubmitOnboardingConsentParams,
  SubmitOnboardingConsentResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

const IOS_URL = "https://apps.apple.com/app/fieldforce-live";
const ANDROID_URL = "https://play.google.com/store/apps/details?id=com.fieldforcelive";
const HUAWEI_URL = "https://appgallery.huawei.com/app/fieldforce-live";

// GET /onboarding/:token -- no auth required
router.get("/onboarding/:token", async (req, res): Promise<void> => {
  const params = GetOnboardingByTokenParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [invite] = await db.select().from(onboardingInvitesTable)
    .where(eq(onboardingInvitesTable.token, params.data.token));
  if (!invite) { res.status(404).json({ error: "Onboarding token not found" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, invite.userId));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  res.json(GetOnboardingByTokenResponse.parse({
    userFirstName: user.firstName,
    status: user.status,
    consentGivenAt: user.consentGivenAt ?? null,
    iosStoreUrl: IOS_URL,
    androidStoreUrl: ANDROID_URL,
    huaweiStoreUrl: HUAWEI_URL,
  }));
});

// POST /onboarding/:token/consent -- no auth required
router.post("/onboarding/:token/consent", async (req, res): Promise<void> => {
  const params = SubmitOnboardingConsentParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [invite] = await db.select().from(onboardingInvitesTable)
    .where(eq(onboardingInvitesTable.token, params.data.token));
  if (!invite) { res.status(404).json({ error: "Onboarding token not found" }); return; }

  const now = new Date();
  await db.update(onboardingInvitesTable).set({ usedAt: now }).where(eq(onboardingInvitesTable.id, invite.id));
  const user = await updateReturning(
    usersTable,
    { status: "ACTIVE", consentGivenAt: now },
    eq(usersTable.id, invite.userId),
  );

  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  res.json(SubmitOnboardingConsentResponse.parse({
    userFirstName: user.firstName,
    status: user.status,
    consentGivenAt: user.consentGivenAt ?? null,
    iosStoreUrl: IOS_URL,
    androidStoreUrl: ANDROID_URL,
    huaweiStoreUrl: HUAWEI_URL,
  }));
});

export default router;
