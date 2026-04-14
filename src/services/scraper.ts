import { execFileSync } from "child_process";
import type { ScrapedReview } from "./review";

function ocBrowser(args: string[], timeoutMs = 30_000): string {
  return execFileSync("openclaw", ["browser", ...args], {
    timeout: timeoutMs,
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"]
  });
}

function checkOpenclawInstalled(): void {
  try {
    execFileSync("which", ["openclaw"], { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
  } catch {
    throw new Error(
      "openclaw CLI is not installed. Install it from https://docs.openclaw.ai to use the fetch command."
    );
  }
}

// openclaw prints plugin banners on stdout before JSON output. Strip any
// non-JSON prefix so JSON.parse can succeed.
function stripNonJsonPrefix(output: string): string {
  const firstBrace = output.indexOf("{");
  return firstBrace >= 0 ? output.substring(firstBrace) : output;
}

export function extractTargetId(jsonOutput: string): string | null {
  try {
    const parsed = JSON.parse(stripNonJsonPrefix(jsonOutput)) as { targetId?: unknown };
    return typeof parsed.targetId === "string" ? parsed.targetId : null;
  } catch {
    return null;
  }
}

export function extractTabIds(jsonOutput: string): string[] {
  try {
    const parsed = JSON.parse(stripNonJsonPrefix(jsonOutput)) as { tabs?: unknown };
    if (!Array.isArray(parsed.tabs)) return [];
    return parsed.tabs
      .filter((t): t is { targetId: string } =>
        typeof t === "object" && t !== null && typeof (t as { targetId?: unknown }).targetId === "string")
      .map(t => t.targetId);
  } catch {
    return [];
  }
}

export function findNextPageRef(snapshot: string): string | null {
  // Match: link "Next" [optional modifiers like [active]] [ref=xxx]
  const match = /link "Next"(?:\s\[\w+\])*\s\[ref=(\w+)\]/.exec(snapshot);
  return match?.[1] ?? null;
}

// Review text appears in several shapes depending on the openclaw version:
//
// Old format (pre-2026.4.11):
//   1. Inline:  `- paragraph [ref=e1]: the whole review on one line`
//   2. Nested:  `- paragraph [ref=e1]:` with `- text:` children
//
// New format (openclaw 2026.4.11+):
//   3. `statictext "review text"` — one or more, separated by `linebreak`
//
// The location and date are also `statictext` in the new format, so those
// are excluded by pattern matching (city/state, month-day-year).
function extractReviewText(block: string): string | null {
  // Try old format first: paragraph-based extraction
  const paragraphStart = /^(\s*)- paragraph \[ref=\w+\]:(.*)$/m.exec(block);
  if (paragraphStart?.index !== undefined) {
    const inline = paragraphStart[2].trim();
    if (inline.length > 0) return inline;

    const paragraphIndent = paragraphStart[1].length;
    const afterParagraph = block.substring(paragraphStart.index + paragraphStart[0].length);
    const textLines: string[] = [];
    for (const line of afterParagraph.split("\n")) {
      if (line.trim().length === 0) continue;
      const indent = line.length - line.trimStart().length;
      if (indent <= paragraphIndent) break;
      const textMatch = /^\s+- text: (.+)$/.exec(line);
      if (textMatch) textLines.push(textMatch[1].trim());
    }
    if (textLines.length > 0) return textLines.join("\n\n");
  }

  // New format: collect `statictext` lines that aren't location or date
  return extractStaticTextReview(block);
}

const DATE_PATTERN = /^(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{1,2}, \d{4}$/;

function extractStaticTextReview(block: string): string | null {
  // In the new format the region contains reviewer info (name, location) as
  // children, while the review content (rating, date, text) are siblings at
  // the same indent level as the region. Since the block string starts at the
  // region's `-`, we detect the child indent from the first indented line and
  // only include statictext at a shallower indent (siblings).
  const lines = block.split("\n");
  let childIndent = Infinity;
  for (let i = 1; i < lines.length; i++) {
    const trimmed = lines[i].trimStart();
    if (trimmed.length === 0) continue;
    const indent = lines[i].length - trimmed.length;
    if (indent > 0) {
      childIndent = indent;
      break;
    }
  }

  const textParts: string[] = [];
  for (const line of lines.slice(1)) {
    const trimmed = line.trimStart();
    if (trimmed.length === 0) continue;
    const indent = line.length - trimmed.length;
    // Skip lines indented at child level or deeper (region children)
    if (indent >= childIndent) continue;
    const m = /- statictext "([^"]+)"/.exec(line);
    if (!m) continue;
    const text = m[1];
    if (DATE_PATTERN.test(text)) continue;
    if (/^\d+ star rating$/.test(text)) continue;
    textParts.push(text);
  }
  return textParts.length > 0 ? textParts.join("\n\n") : null;
}

function slugify(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return slug.length > 0 ? slug : "unknown";
}

export function parseReviewsFromSnapshot(snapshot: string): ScrapedReview[] {
  const reviews: ScrapedReview[] = [];
  const now = new Date().toISOString();

  // Every region whose name ends with "." is a reviewer. Collect all region
  // matches so we can bound each reviewer's block by the next region.
  const regionPattern = /- region "([^"]+)" \[ref=\w+\]:?/g;
  const matches = [...snapshot.matchAll(regionPattern)];

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const reviewerName = match[1];
    // Skip non-reviewer regions (e.g. "Recommended Reviews", "Menu")
    if (!reviewerName.endsWith(".")) continue;

    const startIdx = match.index;
    const startIndent = startIdx - snapshot.lastIndexOf("\n", startIdx) - 1;

    // Bound the block: in old format by next listitem, in new format (and as
    // a general fallback) by the next region at the same or shallower indent.
    const nextListitem = snapshot.indexOf("- listitem", startIdx + 10);
    let nextRegionIdx = -1;
    for (let j = i + 1; j < matches.length; j++) {
      const candidateIdx = matches[j].index;
      const candidateIndent = candidateIdx - snapshot.lastIndexOf("\n", candidateIdx) - 1;
      if (candidateIndent <= startIndent) {
        nextRegionIdx = candidateIdx;
        break;
      }
    }
    let endIdx = -1;
    if (nextListitem > 0 && nextRegionIdx > 0) {
      endIdx = Math.min(nextListitem, nextRegionIdx);
    } else if (nextListitem > 0) {
      endIdx = nextListitem;
    } else if (nextRegionIdx > 0) {
      endIdx = nextRegionIdx;
    }
    let block = endIdx > 0
      ? snapshot.substring(startIdx, endIdx)
      : snapshot.substring(startIdx);

    // Trim at "Business owner information" region so owner-response text
    // doesn't pollute the reviewer's review.
    const ownerWidgetIdx = block.indexOf("- region \"Business owner information\"");
    if (ownerWidgetIdx >= 0) {
      block = block.substring(0, ownerWidgetIdx);
    }

    // Location (old: `generic [ref=...]: City, CA`; new: `statictext "City, CA"`)
    // In the new format, location is a child of the region (indented). Search
    // only the children subtree so sibling review text can't be misattributed.
    const regionLineEnd = block.indexOf("\n");
    const childLines: string[] = [];
    if (regionLineEnd >= 0) {
      for (const line of block.substring(regionLineEnd + 1).split("\n")) {
        if (line.trim().length === 0) continue;
        const indent = line.length - line.trimStart().length;
        if (indent <= startIndent) break;
        childLines.push(line);
      }
    }
    const childBlock = childLines.join("\n");
    const locationMatch
      = /- generic \[ref=\w+\]: ([A-Z][^"\n]+(?:,\s*[A-Z]{2}))/.exec(block)
        ?? /- statictext "([A-Z][^"]+(?:,\s*[A-Z]{2}))"/.exec(childBlock);
    const reviewerLocation = locationMatch?.[1] ?? null;

    // Rating (old: `img`; new: `image`)
    const ratingMatch = /(?:img|image) "(\d+) star rating"/.exec(block);
    const rating = ratingMatch ? parseInt(ratingMatch[1]) : null;
    if (rating === null) continue;

    // Date (old: `generic [ref=...]: Apr 1, 2026`; new: `statictext "Apr 1, 2026"`)
    const dateMatch
      = /- generic \[ref=\w+\]: ((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{1,2}, \d{4})/.exec(block)
        ?? /- statictext "((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{1,2}, \d{4})"/.exec(block);
    const postedAtRaw = dateMatch?.[1] ?? null;
    if (!postedAtRaw) continue;

    const postedAtIso = new Date(postedAtRaw).toISOString().split("T")[0];

    const reviewText = extractReviewText(block);
    if (!reviewText) continue;

    // userId: prefer real Yelp ID from /url: line (old format). When absent
    // (new format), fall back to a slug of the reviewer's display name.
    const userIdMatch = /\/user_details\?userid=([\w-]+)/.exec(block);
    const userId = userIdMatch?.[1]
      ?? slugify(reviewerName);

    reviews.push({
      userId,
      reviewerName,
      reviewerLocation,
      rating,
      postedAtRaw,
      postedAtIso,
      reviewText,
      fetchedAtIso: now
    });
  }

  return reviews;
}

export function scrapeReviews(yelpUrl: string, maxPages: number): ScrapedReview[] {
  checkOpenclawInstalled();

  const sortedUrl = `${yelpUrl.split("?")[0]}?sort_by=date_desc`;

  const allReviews: ScrapedReview[] = [];

  // Record tabs that already existed so we can close only the ones we add.
  const tabsBefore = new Set(extractTabIds(ocBrowser(["--json", "tabs"])));
  const openedTabIds: string[] = [];

  try {
    ocBrowser(["open", sortedUrl], 30_000);

    // Diff to find the tab(s) we just added.
    const tabsAfter = extractTabIds(ocBrowser(["--json", "tabs"]));
    for (const id of tabsAfter) {
      if (!tabsBefore.has(id)) openedTabIds.push(id);
    }

    ocBrowser(["wait", "--text", "Recommended Reviews", "--timeout-ms", "15000"], 20_000);

    for (let page = 0; page < maxPages; page++) {
      if (page > 0) {
        const navSnapshot = ocBrowser(["snapshot"]);
        const nextRef = findNextPageRef(navSnapshot);
        if (!nextRef) break;
        ocBrowser(["click", nextRef]);
        ocBrowser(["wait", "--time", "3000"], 10_000);
      }

      const snapshot = ocBrowser(["snapshot"]);
      const pageReviews = parseReviewsFromSnapshot(snapshot);
      allReviews.push(...pageReviews);
    }
  } finally {
    for (const tabId of openedTabIds) {
      try {
        ocBrowser(["close", tabId]);
      } catch { /* tab may already be gone */ }
    }
  }

  return allReviews;
}
