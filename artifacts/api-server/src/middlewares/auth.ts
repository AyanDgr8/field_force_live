import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";

declare global {
  namespace Express {
    interface Request {
      adminUserId?: number;
    }
  }
}

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET env var is required");
  return secret;
}

export function signJwt(payload: { adminUserId: number; role: string }): string {
  return jwt.sign(payload, getSecret(), { expiresIn: "7d" });
}

export function verifyJwt(token: string): { adminUserId: number; role: string } {
  return jwt.verify(token, getSecret()) as { adminUserId: number; role: string };
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
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

  try {
    const payload = verifyJwt(token);
    if (payload.role === "USER") {
      res.status(403).json({ error: "This account is not authorized to access the admin panel" });
      return;
    }
    const [user] = await db.select({
      role: usersTable.role,
      status: usersTable.status,
      deletedAt: usersTable.deletedAt,
    }).from(usersTable).where(eq(usersTable.id, payload.adminUserId));
    if (!user || user.status !== "ACTIVE" || user.deletedAt || user.role === "USER") {
      res.status(401).json({ error: "Account is inactive or deleted" });
      return;
    }
    req.adminUserId = payload.adminUserId;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired session" });
  }
}
