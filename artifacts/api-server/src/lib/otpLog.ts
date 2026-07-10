import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

const appRoot = process.env.APP_ROOT
  ? path.resolve(process.env.APP_ROOT)
  : path.resolve(import.meta.dirname, "../../../");
const logsRoot = path.join(appRoot, "logs");

function safeSegment(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9._-]/g, "_") || "unknown-user";
}

export async function writeOtpLog(options: {
  username: string;
  code: string;
  userId: number;
  expiresAt: Date;
}): Promise<string> {
  const createdAt = new Date();
  const date = createdAt.toISOString().slice(0, 10);
  const directory = path.join(logsRoot, safeSegment(options.username), date);
  const file = path.join(directory, "otp.log");

  await mkdir(directory, { recursive: true, mode: 0o700 });
  await appendFile(
    file,
    `${JSON.stringify({
      createdAt: createdAt.toISOString(),
      expiresAt: options.expiresAt.toISOString(),
      userId: options.userId,
      otp: options.code,
    })}\n`,
    { encoding: "utf8", mode: 0o600 },
  );

  return file;
}
