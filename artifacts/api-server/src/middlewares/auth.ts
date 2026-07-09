import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

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

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
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
    // Defense in depth: the admin panel only ever issues ADMIN-role tokens
    // (see /auth/login role check), but this middleware re-validates the
    // claim so a future token-issuance change can't silently grant
    // non-admin users access to admin-scoped routes.
    if (payload.role !== "ADMIN") {
      res.status(403).json({ error: "This account is not authorized to access the admin panel" });
      return;
    }
    req.adminUserId = payload.adminUserId;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired session" });
  }
}
