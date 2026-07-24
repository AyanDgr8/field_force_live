import { Router, type IRouter } from "express";
import { eq, or } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { db } from "@workspace/db";
import { credentialsTable, otpTokensTable, usersTable } from "@workspace/db";
import {
  MobileLoginBody,
  MobileLoginResponse,
  RequestMobileOtpBody,
  RequestMobileOtpResponse,
  VerifyMobileOtpBody,
  VerifyMobileOtpResponse,
} from "@workspace/api-zod";
import {
  sendPasswordChangedEmail,
  sendPasswordResetCodeEmail,
} from "../lib/mailer.js";

const router: IRouter = Router();

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET env var is required");
  return secret;
}

export function signDeviceJwt(payload: { userId: number; role: "USER" }): string {
  return jwt.sign(payload, getSecret(), { expiresIn: "30d" });
}

export function verifyDeviceJwt(token: string): { userId: number; role: "USER" } {
  return jwt.verify(token, getSecret()) as { userId: number; role: "USER" };
}

function maskContact(s: string): string {
  if (s.includes("@")) {
    const [local, domain] = s.split("@");
    return (local ?? "").slice(0, 2) + "***@" + domain;
  }
  return s.slice(0, 3) + "***" + s.slice(-2);
}

// Resolve identifier (username / email / phone) → user row
async function resolveUser(identifier: string) {
  // Try username
  const [cred] = await db.select().from(credentialsTable)
    .where(eq(credentialsTable.username, identifier));
  if (cred) {
    const [u] = await db.select().from(usersTable).where(eq(usersTable.id, cred.userId));
    return { user: u ?? null, cred };
  }
  // Try email or phone
  const [u] = await db.select().from(usersTable)
    .where(or(eq(usersTable.email, identifier), eq(usersTable.phoneNumber, identifier)));
  if (!u) return { user: null, cred: null };
  const [c] = await db.select().from(credentialsTable).where(eq(credentialsTable.userId, u.id));
  return { user: u, cred: c ?? null };
}

// POST /user/auth/login
router.post("/user/auth/login", async (req, res): Promise<void> => {
  const parsed = MobileLoginBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { identifier, password } = parsed.data;
  const { user, cred } = await resolveUser(identifier);

  if (!user || !cred) { res.status(401).json({ error: "Invalid credentials" }); return; }
  if (user.role !== "USER") { res.status(403).json({ error: "This endpoint is for field users only" }); return; }

  const ok = await bcrypt.compare(password, cred.passwordHash);
  if (!ok) { res.status(401).json({ error: "Invalid credentials" }); return; }

  const deviceToken = signDeviceJwt({ userId: user.id, role: "USER" });
  res.json(MobileLoginResponse.parse({
    deviceToken,
    user: {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      employeeCode: user.employeeCode,
      customerId: user.customerId,
      role: user.role,
    },
  }));
});

const PasswordResetRequestBody = z.object({
  email: z.string().trim().email(),
});

const PasswordResetConfirmBody = z.object({
  resetToken: z.string().uuid(),
  code: z.string().regex(/^\d{6}$/),
  newPassword: z.string().min(8).max(128),
});

// POST /user/auth/password-reset/request
router.post("/user/auth/password-reset/request", async (req, res): Promise<void> => {
  const parsed = PasswordResetRequestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter a valid email address" });
    return;
  }

  // Always return the same shape so this endpoint cannot be used to enumerate
  // field-agent accounts.
  const resetToken = uuidv4();
  const [user] = await db.select().from(usersTable)
    .where(eq(usersTable.email, parsed.data.email));

  if (user?.role === "USER" && user.status === "ACTIVE") {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    await db.insert(otpTokensTable).values({
      userId: user.id,
      loginToken: resetToken,
      code,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      consumedAt: null,
    });

    try {
      await sendPasswordResetCodeEmail({
        to: user.email,
        code,
        recipientName: user.firstName,
      });
    } catch (error) {
      req.log.error({ err: error, userId: user.id }, "Failed to send password reset email");
      res.status(503).json({ error: "Unable to send reset email right now. Please try again." });
      return;
    }
  }

  res.json({
    resetToken,
    message: "If an active agent account exists for that email, a reset code has been sent.",
  });
});

// POST /user/auth/password-reset/confirm
router.post("/user/auth/password-reset/confirm", async (req, res): Promise<void> => {
  const parsed = PasswordResetConfirmBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter the 6-digit code and a password of at least 8 characters" });
    return;
  }

  const [otp] = await db.select().from(otpTokensTable)
    .where(eq(otpTokensTable.loginToken, parsed.data.resetToken));

  if (
    !otp ||
    otp.consumedAt ||
    otp.expiresAt < new Date() ||
    otp.code !== parsed.data.code
  ) {
    res.status(400).json({ error: "Invalid or expired reset code" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, otp.userId));
  if (!user || user.role !== "USER") {
    res.status(400).json({ error: "Invalid or expired reset code" });
    return;
  }

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);
  const [credential] = await db.select().from(credentialsTable)
    .where(eq(credentialsTable.userId, user.id));

  if (credential) {
    await db.update(credentialsTable)
      .set({ passwordHash })
      .where(eq(credentialsTable.id, credential.id));
  } else {
    await db.insert(credentialsTable).values({
      userId: user.id,
      username: user.employeeCode,
      passwordHash,
    });
  }

  await db.update(otpTokensTable)
    .set({ consumedAt: new Date() })
    .where(eq(otpTokensTable.id, otp.id));

  try {
    await sendPasswordChangedEmail({
      to: user.email,
      recipientName: user.firstName,
    });
  } catch (error) {
    req.log.error({ err: error, userId: user.id }, "Failed to send password changed email");
  }

  res.json({ message: "Password updated. You can now sign in." });
});

// POST /user/auth/otp/request
router.post("/user/auth/otp/request", async (req, res): Promise<void> => {
  const parsed = RequestMobileOtpBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { identifier } = parsed.data;
  const { user } = await resolveUser(identifier);

  if (!user) { res.status(401).json({ error: "User not found" }); return; }
  if (user.role !== "USER") { res.status(403).json({ error: "This endpoint is for field users only" }); return; }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const loginToken = uuidv4();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await db.insert(otpTokensTable).values({
    userId: user.id,
    loginToken,
    code,
    expiresAt,
    consumedAt: null,
  });

  req.log.info({ otp: code, userId: user.id }, "Mobile OTP code for login");

  const otpSentTo = user.email ? maskContact(user.email) : maskContact(user.phoneNumber);
  res.json(RequestMobileOtpResponse.parse({ loginToken, otpSentTo }));
});

// POST /user/auth/otp/verify
router.post("/user/auth/otp/verify", async (req, res): Promise<void> => {
  const parsed = VerifyMobileOtpBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { loginToken, code } = parsed.data;

  const [otp] = await db.select().from(otpTokensTable)
    .where(eq(otpTokensTable.loginToken, loginToken));

  if (!otp) { res.status(401).json({ error: "Invalid login token" }); return; }
  if (otp.consumedAt) { res.status(401).json({ error: "OTP already used" }); return; }
  if (otp.expiresAt < new Date()) { res.status(401).json({ error: "OTP expired" }); return; }
  if (otp.code !== code) { res.status(401).json({ error: "Invalid OTP code" }); return; }

  await db.update(otpTokensTable).set({ consumedAt: new Date() }).where(eq(otpTokensTable.id, otp.id));

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, otp.userId));
  if (!user) { res.status(500).json({ error: "User not found" }); return; }
  if (user.role !== "USER") { res.status(403).json({ error: "This endpoint is for field users only" }); return; }

  const deviceToken = signDeviceJwt({ userId: user.id, role: "USER" });
  res.json(VerifyMobileOtpResponse.parse({
    deviceToken,
    user: {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      employeeCode: user.employeeCode,
      customerId: user.customerId,
      role: user.role,
    },
  }));
});

export default router;
