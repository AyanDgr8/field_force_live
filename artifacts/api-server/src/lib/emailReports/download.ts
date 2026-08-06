/**
 * Fetches a report file from the link found in a report email and stores it on
 * disk. Downloads are capped and content-checked so a link that has expired
 * into a login page is reported as a failure instead of being saved as a report.
 */
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const MAX_BYTES = 64 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 120_000;

export type DownloadedReport = {
  fileName: string;
  storedPath: string;
  sizeBytes: number;
  sha256: string;
  contentType: string | null;
  finalUrl: string;
};

export async function storeReportAttachment(
  buffer: Buffer, remoteName: string, contentType: string, storageDir: string, stamp: string,
): Promise<DownloadedReport> {
  if (buffer.byteLength === 0) throw new Error("Email attachment is empty");
  if (buffer.byteLength > MAX_BYTES) throw new Error(`Attachment is above the ${MAX_BYTES} byte limit`);
  const fileName = safeFileName(remoteName);
  const storedPath = path.join(storageDir, `${stamp}__${fileName}`);
  await mkdir(path.dirname(storedPath), { recursive: true });
  await writeFile(storedPath, buffer);
  return {
    fileName, storedPath, sizeBytes: buffer.byteLength,
    sha256: createHash("sha256").update(buffer).digest("hex"), contentType, finalUrl: "email-attachment",
  };
}

function fileNameFromDisposition(header: string | null): string | null {
  if (!header) return null;
  const encoded = /filename\*\s*=\s*[^']*'[^']*'([^;]+)/i.exec(header);
  if (encoded?.[1]) {
    try {
      return decodeURIComponent(encoded[1].trim().replace(/^"|"$/g, ""));
    } catch {
      // Fall through to the plain filename parameter.
    }
  }
  const plain = /filename\s*=\s*"?([^";]+)"?/i.exec(header);
  return plain?.[1]?.trim() ?? null;
}

function fileNameFromUrl(url: string): string | null {
  try {
    const name = path.basename(new URL(url).pathname);
    return name && name !== "/" ? decodeURIComponent(name) : null;
  } catch {
    return null;
  }
}

/** Strips directory separators so a remote name can never escape the store. */
function safeFileName(name: string): string {
  const base = path.basename(name).replace(/[^\w.\-]+/g, "_").replace(/^\.+/, "");
  return base.slice(0, 180) || "report";
}

function extensionFor(contentType: string | null): string {
  if (!contentType) return ".bin";
  if (/csv/i.test(contentType)) return ".csv";
  if (/sheet|excel|xlsx/i.test(contentType)) return ".xlsx";
  if (/zip/i.test(contentType)) return ".zip";
  if (/gzip|x-gzip/i.test(contentType)) return ".csv.gz";
  return ".bin";
}

/**
 * An expired or unauthenticated link usually still returns 200 — with an HTML
 * sign-in page. Report that as a failure rather than storing it as a report.
 */
function looksLikeHtmlPage(buffer: Buffer, contentType: string | null): boolean {
  if (contentType && /text\/html/i.test(contentType)) return true;
  const head = buffer.subarray(0, 512).toString("utf8").trimStart().toLowerCase();
  return head.startsWith("<!doctype html") || head.startsWith("<html");
}

export async function downloadReport(url: string, storageDir: string, stamp: string): Promise<DownloadedReport> {
  const requestedUrl = new URL(url);
  if (requestedUrl.protocol !== "https:") throw new Error("Report links must use HTTPS");
  const response = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: {
      // Some report endpoints serve HTML unless a file type is requested.
      Accept: "text/csv,application/gzip,application/x-gzip,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/octet-stream,*/*",
    },
  });
  if (!response.ok) {
    throw new Error(`Download failed with HTTP ${response.status} ${response.statusText}`);
  }

  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BYTES) {
    throw new Error(`Report is ${declaredLength} bytes, above the ${MAX_BYTES} byte limit`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength === 0) throw new Error("Download returned an empty file");
  if (buffer.byteLength > MAX_BYTES) {
    throw new Error(`Report is ${buffer.byteLength} bytes, above the ${MAX_BYTES} byte limit`);
  }

  const contentType = response.headers.get("content-type");
  if (looksLikeHtmlPage(buffer, contentType)) {
    throw new Error("The link returned a web page rather than a report file — it may have expired or need a sign-in");
  }

  const remoteName =
    fileNameFromDisposition(response.headers.get("content-disposition")) ??
    fileNameFromUrl(response.url) ??
    `report${extensionFor(contentType)}`;

  // The stamp keeps same-named daily reports from overwriting each other.
  const fileName = safeFileName(remoteName);
  const storedPath = path.join(storageDir, `${stamp}__${fileName}`);
  await mkdir(path.dirname(storedPath), { recursive: true });
  await writeFile(storedPath, buffer);

  return {
    fileName,
    storedPath,
    sizeBytes: buffer.byteLength,
    sha256: createHash("sha256").update(buffer).digest("hex"),
    contentType,
    finalUrl: response.url,
  };
}
