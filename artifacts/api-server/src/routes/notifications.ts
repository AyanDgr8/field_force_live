/**
 * WhatsApp notification configuration.
 *
 * SECURITY:
 *  - credentials_enc is WRITE-ONLY. Secret fields (access tokens, auth tokens,
 *    API keys) are never returned; responses carry a short hint instead.
 *  - Leaving a secret field blank on save keeps the stored value, so the form
 *    can be re-submitted without retyping tokens.
 *  - Only SUPER_ADMIN may read or change the configuration.
 *
 * GET   /notifications/whatsapp/providers  — credential specs for the UI
 * GET   /notifications/whatsapp/settings   — sanitised current configuration
 * PUT   /notifications/whatsapp/settings   — upsert configuration
 * POST  /notifications/whatsapp/test-connection — validate credentials
 * POST  /notifications/whatsapp/test-message    — send a real test message
 * GET   /notifications/whatsapp/templates  — approved templates at the provider
 * GET   /notifications/logs                — recent delivery attempts
 */
import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, notificationLogTable, usersTable } from "@workspace/db";
import {
  notificationKindValues,
  whatsappProviderValues,
  notificationChannelModeValues,
  whatsappMessageModeValues,
} from "@workspace/db";
import { requireAuth } from "../middlewares/auth.js";
import { PROVIDER_SPECS, missingRequiredFields, providerSpec } from "../lib/whatsapp/providers.js";
import { TEMPLATE_DEFINITIONS } from "../lib/whatsapp/messages.js";
import {
  findWhatsappSettingsRow,
  loadWhatsappSettings,
  mergeCredentialUpdate,
  sanitizeSettings,
  saveWhatsappSettings,
} from "../lib/whatsapp/settings.js";
import {
  fetchApprovedTemplates,
  sendWhatsAppNotification,
  testWhatsAppConnection,
} from "../lib/whatsapp/index.js";

const router: IRouter = Router();

type Actor = { id: number; customerId: number; role: string; firstName: string };

/**
 * Notification credentials are tenant-wide and grant the ability to message
 * every field agent, so they sit behind the top role only.
 */
async function requireSuperAdmin(adminUserId: number): Promise<Actor | null> {
  const [user] = await db
    .select({
      id: usersTable.id,
      customerId: usersTable.customerId,
      role: usersTable.role,
      firstName: usersTable.firstName,
    })
    .from(usersTable)
    .where(eq(usersTable.id, adminUserId));

  return user && user.role === "SUPER_ADMIN" ? user : null;
}

// ── Provider catalogue ────────────────────────────────────────────────────────
router.get("/notifications/whatsapp/providers", requireAuth, (_req, res): void => {
  res.json({
    providers: PROVIDER_SPECS,
    notifications: Object.entries(TEMPLATE_DEFINITIONS).map(([kind, definition]) => ({
      kind,
      ...definition,
    })),
  });
});

// ── Read configuration ────────────────────────────────────────────────────────
router.get("/notifications/whatsapp/settings", requireAuth, async (req, res): Promise<void> => {
  const actor = await requireSuperAdmin(req.adminUserId!);
  if (!actor) { res.status(403).json({ error: "Super admin access required" }); return; }

  const resolved = await loadWhatsappSettings(actor.customerId);
  const row = await findWhatsappSettingsRow(actor.customerId).catch(() => null);

  res.json({
    ...sanitizeSettings(resolved),
    health: {
      status: row?.status ?? (resolved.enabled ? "ACTIVE" : "DISABLED"),
      lastError: row?.lastError ?? null,
      lastSuccessAt: row?.lastSuccessAt ?? null,
      lastTestedAt: row?.lastTestedAt ?? null,
      consecutiveFailures: row?.consecutiveFailures ?? 0,
    },
  });
});

// ── Write configuration ───────────────────────────────────────────────────────
const TemplateEntry = z.object({
  name: z.string().trim().min(1).max(191),
  language: z.string().trim().min(2).max(16).default("en"),
  category: z.enum(["AUTHENTICATION", "UTILITY"]).default("UTILITY"),
});

const SettingsBody = z.object({
  provider: z.enum(whatsappProviderValues),
  enabled: z.boolean(),
  channelMode: z.enum(notificationChannelModeValues),
  messageMode: z.enum(whatsappMessageModeValues),
  defaultCountryCode: z.string().trim().regex(/^\d{1,4}$/, "Country code must be 1-4 digits"),
  otpRecipients: z.array(z.string().trim()).max(20).default([]),
  credentials: z.record(z.string(), z.string()).default({}),
  templates: z.record(z.enum(notificationKindValues), TemplateEntry).optional(),
});

router.put("/notifications/whatsapp/settings", requireAuth, async (req, res): Promise<void> => {
  const actor = await requireSuperAdmin(req.adminUserId!);
  if (!actor) { res.status(403).json({ error: "Super admin access required" }); return; }

  const parsed = SettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid settings" });
    return;
  }
  const body = parsed.data;

  // Only fields this provider declares are stored, so switching providers can
  // never smuggle another provider's leftovers into the encrypted blob.
  const allowed = new Set(providerSpec(body.provider).fields.map((field) => field.key));
  const credentials = Object.fromEntries(
    Object.entries(body.credentials).filter(([key]) => allowed.has(key)),
  );

  const existing = await loadWhatsappSettings(actor.customerId);
  const templates = { ...existing.templates };
  for (const [kind, entry] of Object.entries(body.templates ?? {})) {
    if (entry) templates[kind as keyof typeof templates] = entry;
  }

  // Enabling with an incomplete credential set would silently drop every
  // WhatsApp message, so it is rejected up front rather than at send time.
  // The check runs against what the save will actually persist, so a blank
  // secret that keeps its stored value does not read as missing.
  if (body.enabled) {
    const carried = mergeCredentialUpdate({
      provider: body.provider,
      incoming: credentials,
      previous: existing.credentials,
      previousProvider: existing.provider,
    });
    const missing = missingRequiredFields(body.provider, carried);
    if (missing.length) {
      res.status(400).json({
        error: `Cannot enable WhatsApp until these are filled in: ${missing.join(", ")}`,
      });
      return;
    }
  }

  try {
    const saved = await saveWhatsappSettings({
      customerId: actor.customerId,
      provider: body.provider,
      enabled: body.enabled,
      channelMode: body.channelMode,
      messageMode: body.messageMode,
      defaultCountryCode: body.defaultCountryCode,
      otpRecipients: body.otpRecipients.filter(Boolean),
      templates,
      credentials,
    });

    req.log.info(
      { customerId: actor.customerId, provider: saved.provider, enabled: saved.enabled },
      "WhatsApp notification settings updated",
    );

    const resolved = await loadWhatsappSettings(actor.customerId);
    res.json({ ...sanitizeSettings(resolved), message: "WhatsApp settings saved" });
  } catch (error) {
    req.log.error({ err: error, customerId: actor.customerId }, "Failed to save WhatsApp settings");
    res.status(500).json({ error: "Failed to save WhatsApp settings" });
  }
});

// ── Credential check ──────────────────────────────────────────────────────────
router.post("/notifications/whatsapp/test-connection", requireAuth, async (req, res): Promise<void> => {
  const actor = await requireSuperAdmin(req.adminUserId!);
  if (!actor) { res.status(403).json({ error: "Super admin access required" }); return; }

  const result = await testWhatsAppConnection(actor.customerId);
  res.status(result.ok ? 200 : 400).json(result);
});

// ── Live test message ─────────────────────────────────────────────────────────
const TestMessageBody = z.object({
  phoneNumber: z.string().trim().min(6).max(24),
});

router.post("/notifications/whatsapp/test-message", requireAuth, async (req, res): Promise<void> => {
  const actor = await requireSuperAdmin(req.adminUserId!);
  if (!actor) { res.status(403).json({ error: "Super admin access required" }); return; }

  const parsed = TestMessageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter the phone number to send the test to" });
    return;
  }

  const result = await sendWhatsAppNotification({
    customerId: actor.customerId,
    userId: actor.id,
    payload: { kind: "TEST", recipientName: actor.firstName },
    toOverride: [parsed.data.phoneNumber],
  });

  if (result.ok) {
    res.json({ ok: true, sentTo: result.sentTo, message: `Test message sent to ${result.sentTo.join(", ")}` });
    return;
  }

  res.status(400).json({
    ok: false,
    error: result.skippedReason ?? result.errors[0] ?? "Test message failed",
  });
});

// ── Approved templates at the provider ────────────────────────────────────────
router.get("/notifications/whatsapp/templates", requireAuth, async (req, res): Promise<void> => {
  const actor = await requireSuperAdmin(req.adminUserId!);
  if (!actor) { res.status(403).json({ error: "Super admin access required" }); return; }

  res.json(await fetchApprovedTemplates(actor.customerId));
});

// ── Delivery log ──────────────────────────────────────────────────────────────
router.get("/notifications/logs", requireAuth, async (req, res): Promise<void> => {
  const actor = await requireSuperAdmin(req.adminUserId!);
  if (!actor) { res.status(403).json({ error: "Super admin access required" }); return; }

  const limit = Math.min(Number(req.query.limit ?? 50) || 50, 200);
  try {
    const rows = await db
      .select()
      .from(notificationLogTable)
      .where(eq(notificationLogTable.customerId, actor.customerId))
      .orderBy(desc(notificationLogTable.id))
      .limit(limit);
    res.json(rows);
  } catch (error) {
    // The log table is missing until the schema push runs; an empty list keeps
    // the rest of the page usable.
    req.log.error({ err: error }, "Failed to read notification log");
    res.json([]);
  }
});

export default router;
