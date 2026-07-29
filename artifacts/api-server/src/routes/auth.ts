import { Router, type IRouter } from "express";
import { and, eq, isNull } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { db } from "@workspace/db";
import {
  credentialsTable,
  otpTokensTable,
  usersTable,
  customersTable,
} from "@workspace/db";
import {
  LoginBody,
  LoginResponse,
  VerifyOtpBody,
  VerifyOtpResponse,
  GetMeResponse,
} from "@workspace/api-zod";
import { signJwt, verifyJwt } from "../middlewares/auth.js";
import {
  loginOtpRecipients,
  sendLoginOtpEmail,
  sendPasswordChangedEmail,
  sendPasswordResetLinkEmail,
} from "../lib/mailer.js";
import { writeOtpLog } from "../lib/otpLog.js";
import {
  PASSWORD_RESET_LINK_CODE,
  PASSWORD_RESET_TTL_MINUTES,
  passwordResetLinkUrl,
} from "../lib/accounts.js";

const router: IRouter = Router();

const isProduction = process.env.NODE_ENV === "production";

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  const masked = local.slice(0, 2) + "***";
  return `${masked}@${domain}`;
}

// POST /auth/login
router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { username, password } = parsed.data;

  let [cred] = await db
    .select()
    .from(credentialsTable)
    .where(eq(credentialsTable.username, username));

  // Administrators may sign in with either their generated username or email.
  if (!cred && username.includes("@")) {
    const [emailUser] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, username.trim().toLowerCase()));
    if (emailUser) {
      [cred] = await db
        .select()
        .from(credentialsTable)
        .where(eq(credentialsTable.userId, emailUser.id));
    }
  }

  if (!cred) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const ok = await bcrypt.compare(password, cred.passwordHash);
  if (!ok) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, cred.userId));

  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }

  if (user.role === "USER") {
    res.status(403).json({ error: "This account is not authorized to access the admin panel" });
    return;
  }

  // Generate 6-digit OTP
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

  try {
    const otpLogFile = await writeOtpLog({
      username,
      code,
      userId: user.id,
      expiresAt,
    });
    req.log.info({ otpLogFile, userId: user.id }, "OTP written to audit log");
  } catch (error) {
    req.log.error({ err: error, userId: user.id }, "Failed to write OTP audit log");
  }

  const otpRecipients = loginOtpRecipients(user.email);
  // SMTP delivery is intentionally detached from the login request. Production
  // mail servers can be slow or temporarily unreachable; the OTP is already
  // persisted and audit-logged, so holding the HTTP response only makes the
  // dashboard appear frozen. Delivery failures remain visible in API logs.
  void sendLoginOtpEmail({
      to: user.email,
      code,
      recipientName: user.firstName,
    })
    .then(() => req.log.info({ userId: user.id, recipients: otpRecipients.map(maskEmail) }, "Login OTP email sent"))
    .catch(error => req.log.error({ err: error, userId: user.id }, "Failed to send login OTP email"));

  const data = LoginResponse.parse({
    loginToken,
    otpSentTo: otpRecipients.map(maskEmail).join(", "),
  });
  res.json(data);
});

// POST /auth/verify-otp
router.post("/auth/verify-otp", async (req, res): Promise<void> => {
  const parsed = VerifyOtpBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { loginToken, code } = parsed.data;

  const [otp] = await db
    .select()
    .from(otpTokensTable)
    .where(eq(otpTokensTable.loginToken, loginToken));

  if (!otp) {
    res.status(401).json({ error: "Invalid login token" });
    return;
  }
  if (otp.consumedAt) {
    res.status(401).json({ error: "OTP already used" });
    return;
  }
  if (otp.expiresAt < new Date()) {
    res.status(401).json({ error: "OTP expired" });
    return;
  }
  if (otp.code !== code) {
    res.status(401).json({ error: "Invalid OTP code" });
    return;
  }

  // Mark consumed
  await db
    .update(otpTokensTable)
    .set({ consumedAt: new Date() })
    .where(eq(otpTokensTable.id, otp.id));

  const [user] = await db
    .select({
      id: usersTable.id,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      email: usersTable.email,
      customerId: usersTable.customerId,
      customerName: customersTable.name,
      role: usersTable.role,
    })
    .from(usersTable)
    .innerJoin(customersTable, eq(usersTable.customerId, customersTable.id))
    .where(eq(usersTable.id, otp.userId));

  if (!user) {
    res.status(500).json({ error: "User not found" });
    return;
  }

  if (user.role === "USER") {
    res.status(403).json({ error: "This account is not authorized to access the admin panel" });
    return;
  }

  const token = signJwt({ adminUserId: user.id, role: user.role });

  // Set httpOnly cookie
  res.cookie("ff_session", token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  const data = VerifyOtpResponse.parse({ token, admin: user });
  res.json(data);
});

// GET /auth/me
router.get("/auth/me", async (req, res): Promise<void> => {
  let token: string | undefined;
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.slice(7);
  } else if (req.cookies?.ff_session) {
    token = req.cookies.ff_session as string;
  }

  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  let payload: { adminUserId: number };
  try {
    payload = verifyJwt(token);
  } catch {
    res.status(401).json({ error: "Invalid or expired session" });
    return;
  }

  const [user] = await db
    .select({
      id: usersTable.id,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      email: usersTable.email,
      customerId: usersTable.customerId,
      customerName: customersTable.name,
      role: usersTable.role,
    })
    .from(usersTable)
    .innerJoin(customersTable, eq(usersTable.customerId, customersTable.id))
    .where(eq(usersTable.id, payload.adminUserId));

  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }

  res.json(GetMeResponse.parse(user));
});

// POST /auth/logout
router.post("/auth/logout", (_req, res): void => {
  res.clearCookie("ff_session");
  res.sendStatus(204);
});

const PasswordResetRequestBody = z.object({
  email: z.string().trim().email(),
});

const PasswordResetConfirmBody = z.object({
  userId: z.coerce.number().int().positive(),
  token: z.string().uuid(),
  newPassword: z.string().min(8).max(128),
});

// POST /auth/password-reset/request -- email a one-time reset link
router.post("/auth/password-reset/request", async (req, res): Promise<void> => {
  const parsed = PasswordResetRequestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter a valid email address" });
    return;
  }

  const email = parsed.data.email.toLowerCase();
  const [user] = await db
    .select()
    .from(usersTable)
    .where(and(eq(usersTable.email, email), isNull(usersTable.deletedAt)));

  if (!user || user.status !== "ACTIVE") {
    res.status(404).json({
      error: "The email address you entered is not associated with an account.",
    });
    return;
  }

  const token = uuidv4();
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MINUTES * 60 * 1000);
  await db.insert(otpTokensTable).values({
    userId: user.id,
    loginToken: token,
    code: PASSWORD_RESET_LINK_CODE,
    expiresAt,
    consumedAt: null,
  });

  try {
    await sendPasswordResetLinkEmail({
      to: user.email,
      recipientName: user.firstName,
      resetUrl: passwordResetLinkUrl(user.id, token),
      expiresInMinutes: PASSWORD_RESET_TTL_MINUTES,
    });
  } catch (error) {
    req.log.error({ err: error, userId: user.id }, "Failed to send password reset link");
    res.status(502).json({ error: "Unable to send the reset email. Please try again." });
    return;
  }

  res.json({
    message: "Password reset link has been sent to your email. Please check your inbox.",
  });
});

// POST /auth/password-reset/confirm -- consume the link and set a new password
router.post("/auth/password-reset/confirm", async (req, res): Promise<void> => {
  const parsed = PasswordResetConfirmBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Password must be at least 8 characters long" });
    return;
  }

  const [resetToken] = await db
    .select()
    .from(otpTokensTable)
    .where(eq(otpTokensTable.loginToken, parsed.data.token));

  // The sentinel check keeps a login OTP row from being spent as a reset link.
  if (
    !resetToken ||
    resetToken.code !== PASSWORD_RESET_LINK_CODE ||
    resetToken.userId !== parsed.data.userId ||
    resetToken.consumedAt ||
    resetToken.expiresAt < new Date()
  ) {
    res.status(400).json({ error: "This reset link is invalid or has expired." });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(and(eq(usersTable.id, resetToken.userId), isNull(usersTable.deletedAt)));

  if (!user || user.status !== "ACTIVE") {
    res.status(400).json({ error: "This reset link is invalid or has expired." });
    return;
  }

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);
  const [credential] = await db
    .select()
    .from(credentialsTable)
    .where(eq(credentialsTable.userId, user.id));

  if (credential) {
    await db
      .update(credentialsTable)
      .set({ passwordHash })
      .where(eq(credentialsTable.id, credential.id));
  } else {
    await db.insert(credentialsTable).values({
      userId: user.id,
      username: user.employeeCode,
      passwordHash,
    });
  }

  await db
    .update(otpTokensTable)
    .set({ consumedAt: new Date() })
    .where(eq(otpTokensTable.id, resetToken.id));

  try {
    await sendPasswordChangedEmail({ to: user.email, recipientName: user.firstName });
  } catch (error) {
    req.log.error({ err: error, userId: user.id }, "Failed to send password changed email");
  }

  res.json({ message: "Password reset successful" });
});

export default router;
