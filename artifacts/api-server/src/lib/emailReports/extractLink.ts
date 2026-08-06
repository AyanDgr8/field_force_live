/**
 * Picks the report download link out of a report email.
 *
 * The message body is not a fixed template — the link has appeared as a bare
 * URL, as an anchor labelled "Click here", and wrapped in a click-tracking
 * redirect. Rather than matching one shape, every URL in the message is scored
 * and the best candidate wins. All candidates are kept so an operator can see
 * what else was on offer when the wrong link is picked.
 */

export type LinkCandidate = {
  url: string;
  /** Anchor text, when the URL came from an HTML link. */
  label: string | null;
  score: number;
};

// Hosts and paths that are never the report: footers, tracking, and social.
const REJECT_PATTERNS = [
  /unsubscribe/i, /opt[-_]?out/i, /mailto:/i, /privacy/i, /terms/i,
  /facebook\.com/i, /twitter\.com/i, /x\.com\//i, /linkedin\.com/i,
  /instagram\.com/i, /youtube\.com/i, /\.(png|jpe?g|gif|svg|ico|css|js)(\?|$)/i,
];

// Signals that a URL is the report itself, strongest first.
const SCORE_RULES: Array<{ pattern: RegExp; points: number }> = [
  { pattern: /\.csv\.gz(\?|$)/i, points: 80 },
  { pattern: /\.csv(\?|$)/i, points: 60 },
  { pattern: /\.xlsx?(\?|$)/i, points: 60 },
  { pattern: /\.zip(\?|$)/i, points: 40 },
  { pattern: /final_result/i, points: 50 },
  { pattern: /bigquery/i, points: 40 },
  { pattern: /runsheet/i, points: 35 },
  { pattern: /ecosetu/i, points: 35 },
  { pattern: /storage\.googleapis\.com/i, points: 30 },
  { pattern: /(^|[./])drive\.google\.com/i, points: 25 },
  { pattern: /\bdownload\b/i, points: 25 },
  { pattern: /\breport\b/i, points: 20 },
  { pattern: /\bexport\b/i, points: 15 },
  { pattern: /\bshipment/i, points: 15 },
  { pattern: /\battachment/i, points: 10 },
];

// Anchor text is a strong hint when the URL itself is an opaque redirect.
const LABEL_RULES: Array<{ pattern: RegExp; points: number }> = [
  { pattern: /click\s*here/i, points: 25 },
  { pattern: /download/i, points: 30 },
  { pattern: /report/i, points: 20 },
  { pattern: /\bfile/i, points: 15 },
];

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, " ");
}

function stripTags(value: string): string {
  return decodeEntities(value.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

function normalizeUrl(raw: string): string | null {
  // Trailing punctuation is picked up when a bare URL ends a sentence.
  const cleaned = decodeEntities(raw.trim()).replace(/[),.;'"\]]+$/, "");
  if (!/^https?:\/\//i.test(cleaned)) return null;
  try {
    return new URL(cleaned).toString();
  } catch {
    return null;
  }
}

function scoreCandidate(url: string, label: string | null): number {
  // Query strings often carry the real filename inside a redirect wrapper, so
  // the whole URL is scored rather than just the path.
  let score = 0;
  for (const rule of SCORE_RULES) if (rule.pattern.test(url)) score += rule.points;
  if (label) for (const rule of LABEL_RULES) if (rule.pattern.test(label)) score += rule.points;
  return score;
}

/**
 * Returns every plausible download link, best first. `html` is preferred when
 * present because anchor text carries the label; `text` is the plain-text part.
 */
export function extractLinkCandidates(html: string | null, text: string | null): LinkCandidate[] {
  const byUrl = new Map<string, LinkCandidate>();

  const consider = (rawUrl: string, label: string | null) => {
    const url = normalizeUrl(rawUrl);
    if (!url) return;
    if (REJECT_PATTERNS.some(pattern => pattern.test(url))) return;

    const trimmedLabel = label && label.trim() ? label.trim().slice(0, 200) : null;
    const existing = byUrl.get(url);
    // The same URL can appear as both a bare string and an anchor; keep the
    // labelled version since it scores on anchor text too.
    if (existing && !(trimmedLabel && !existing.label)) return;
    byUrl.set(url, { url, label: trimmedLabel, score: scoreCandidate(url, trimmedLabel) });
  };

  if (html) {
    const anchor = /<a\b[^>]*?href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi;
    for (const match of html.matchAll(anchor)) {
      consider(match[1] ?? match[2] ?? match[3] ?? "", stripTags(match[4] ?? ""));
    }
  }

  for (const source of [html ? stripTags(html) : "", text ?? ""]) {
    // Some mail templates expose Markdown-style [label](signed-url) links in
    // the plain-text part. Parse those before scanning for bare URLs.
    for (const match of source.matchAll(/\[([^\]]*)\]\((https?:\/\/[^\s<>"]+)\)/gi)) consider(match[2], match[1]);
    for (const match of source.matchAll(/https?:\/\/[^\s<>"')\[\](]+/gi)) consider(match[0], null);
  }

  return [...byUrl.values()].sort((a, b) => b.score - a.score || a.url.localeCompare(b.url));
}

/** The single best download link, or null when the message carried none. */
export function extractDownloadLink(html: string | null, text: string | null): LinkCandidate | null {
  return extractLinkCandidates(html, text)[0] ?? null;
}
