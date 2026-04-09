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

function parseReviewsFromSnapshot(snapshot: string): ScrapedReview[] {
  const reviews: ScrapedReview[] = [];
  const now = new Date().toISOString();

  // Split snapshot into review blocks by looking for region elements with reviewer names
  const regionPattern = /- region "([^"]+)" \[ref=\w+\]:/g;
  const matches = [...snapshot.matchAll(regionPattern)];

  for (const match of matches) {
    const reviewerName = match[1];
    // Skip non-reviewer regions
    if (reviewerName === "Username") continue;
    if (!(/\.$/.exec(reviewerName)) && !(/\.\.$/.exec(reviewerName))) continue;

    const startIdx = match.index;
    // Bound the block by the next listitem
    const nextListitem = snapshot.indexOf("- listitem", startIdx + 10);
    const block = nextListitem > 0
      ? snapshot.substring(startIdx, nextListitem)
      : snapshot.substring(startIdx);

    // Extract userId from /url: /user_details?userid=...
    const userIdMatch = /\/user_details\?userid=(\w+)/.exec(block);
    const userId = userIdMatch?.[1];
    if (!userId) continue;

    // Extract location
    const locationMatch = /- generic \[ref=\w+\]: ([A-Z][^"\n]+(?:,\s*[A-Z]{2}))/.exec(block);
    const reviewerLocation = locationMatch?.[1] ?? null;

    // Extract rating
    const ratingMatch = /img "(\d+) star rating"/.exec(block);
    const rating = ratingMatch ? parseInt(ratingMatch[1]) : null;
    if (!rating) continue;

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
      fetchedAtIso: now,
      locationName: null
    });
  }

  return reviews;
}

export function scrapeReviews(yelpUrl: string, maxPages: number): ScrapedReview[] {
  checkOpenclawInstalled();

  const sortedUrl = `${yelpUrl.split("?")[0]}?sort_by=date_desc`;

  ocBrowser(["navigate", sortedUrl], 30_000);
  ocBrowser(["wait", "--text", "Recommended Reviews", "--timeout-ms", "15000"], 20_000);

  const allReviews: ScrapedReview[] = [];

  for (let page = 0; page < maxPages; page++) {
    if (page > 0) {
      try {
        const snapshot = ocBrowser(["snapshot"]);
        const nextMatch = /link "Next" \[ref=(\w+)\]/.exec(snapshot);
        if (!nextMatch) break;
        ocBrowser(["click", nextMatch[1]]);
        ocBrowser(["wait", "--time", "3000"], 10_000);
      } catch {
        break;
      }
    }

    const snapshot = ocBrowser(["snapshot"]);
    const pageReviews = parseReviewsFromSnapshot(snapshot);
    allReviews.push(...pageReviews);
  }

  return allReviews;
}
