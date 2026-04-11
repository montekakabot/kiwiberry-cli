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

// Review text appears in two shapes in Yelp's accessibility snapshot:
//   1. Inline:  `- paragraph [ref=e1]: the whole review on one line`
//   2. Nested:  `- paragraph [ref=e1]:` with a `- generic` child whose
//               `- text:` children are the review paragraphs (reviewers with
//               photos or Elite status render this way).
function extractReviewText(block: string): string | null {
  const paragraphStart = /- paragraph \[ref=\w+\]:(.*)$/m.exec(block);
  if (paragraphStart?.index === undefined) return null;

  const inline = paragraphStart[1].trim();
  if (inline.length > 0) return inline;

  // Collect contiguous `- text:` children within the paragraph's subtree.
  const afterParagraph = block.substring(paragraphStart.index + paragraphStart[0].length);
  const textLines: string[] = [];
  for (const line of afterParagraph.split("\n")) {
    const textMatch = /^\s+- text: (.+)$/.exec(line);
    if (textMatch) {
      textLines.push(textMatch[1].trim());
      continue;
    }
    if (textLines.length > 0 && /^\s*- \w/.test(line) && !/^\s+- generic/.test(line)) {
      break;
    }
  }
  return textLines.length > 0 ? textLines.join("\n\n") : null;
}

export function parseReviewsFromSnapshot(snapshot: string): ScrapedReview[] {
  const reviews: ScrapedReview[] = [];
  const now = new Date().toISOString();

  // Split snapshot into review blocks by looking for region elements with reviewer names
  const regionPattern = /- region "([^"]+)" \[ref=\w+\]:/g;
  const matches = [...snapshot.matchAll(regionPattern)];

  for (const match of matches) {
    const reviewerName = match[1];
    // Skip non-reviewer regions
    if (!reviewerName.endsWith(".")) continue;

    const startIdx = match.index;
    // Bound the block by the next listitem
    const nextListitem = snapshot.indexOf("- listitem", startIdx + 10);
    let block = nextListitem > 0
      ? snapshot.substring(startIdx, nextListitem)
      : snapshot.substring(startIdx);

    // Yelp injects a sibling "Business owner information" region containing
    // the owner's response. Trim the block there so its paragraphs can't be
    // mistaken for the reviewer's own text.
    const ownerWidgetIdx = block.indexOf("- region \"Business owner information\"");
    if (ownerWidgetIdx >= 0) {
      block = block.substring(0, ownerWidgetIdx);
    }

    // Extract userId from /url: /user_details?userid=...
    const userIdMatch = /\/user_details\?userid=([\w-]+)/.exec(block);
    const userId = userIdMatch?.[1];
    if (!userId) continue;

    // Extract location
    const locationMatch = /- generic \[ref=\w+\]: ([A-Z][^"\n]+(?:,\s*[A-Z]{2}))/.exec(block);
    const reviewerLocation = locationMatch?.[1] ?? null;

    // Extract rating
    const ratingMatch = /img "(\d+) star rating"/.exec(block);
    const rating = ratingMatch ? parseInt(ratingMatch[1]) : null;
    if (rating === null) continue;

    // Extract date
    const dateMatch = /- generic \[ref=\w+\]: ((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{1,2}, \d{4})/.exec(block);
    const postedAtRaw = dateMatch?.[1] ?? null;
    if (!postedAtRaw) continue;

    const postedAtIso = new Date(postedAtRaw).toISOString().split("T")[0];

    const reviewText = extractReviewText(block);
    if (!reviewText) continue;

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
