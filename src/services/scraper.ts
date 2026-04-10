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

export function findNextPageRef(snapshot: string): string | null {
  // Match: link "Next" [optional modifiers like [active]] [ref=xxx]
  const match = /link "Next"(?:\s\[\w+\])*\s\[ref=(\w+)\]/.exec(snapshot);
  return match?.[1] ?? null;
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
    const block = nextListitem > 0
      ? snapshot.substring(startIdx, nextListitem)
      : snapshot.substring(startIdx);

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

    // Extract review text
    const textMatch = /- paragraph \[ref=\w+\]: (.+)/.exec(block);
    const reviewText = textMatch?.[1]?.trim();
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

  ocBrowser(["navigate", sortedUrl], 30_000);
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

  return allReviews;
}
