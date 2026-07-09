import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
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

  const [cred] = await db
    .select()
    .from(credentialsTable)
    .where(eq(credentialsTable.username, username));

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

  if (user.role !== "ADMIN") {
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

  req.log.info({ otp: code, userId: user.id }, "OTP code for login");

  const data = LoginResponse.parse({
    loginToken,
    otpSentTo: maskEmail(user.email),
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

  if (user.role !== "ADMIN") {
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

export default router;
