import { defineCommand } from "citty";
import { eq } from "drizzle-orm";
import { homedir } from "os";
import { join } from "path";
import { getDatabase } from "../db";
import { businesses } from "../db/schema";
import { getConfig } from "../services/config";
import { syncReviews } from "../services/review";
import { scrapeReviews } from "../services/scraper";

function getDb() {
  return getDatabase(join(homedir(), ".kiwiberry"));
}

export default defineCommand({
  meta: { description: "Fetch new Yelp reviews for a business" },
  args: {
    b: { type: "string", description: "Business ID", required: true },
    pages: { type: "string", description: "Number of pages to scrape", required: false }
  },
  run({ args }) {
    const db = getDb();

    const id = Number(args.b);
    if (Number.isNaN(id)) {
      console.error("Business ID must be a number");
      process.exit(1);
    }

    const biz = db.select().from(businesses).where(eq(businesses.id, id)).get();
    if (!biz) {
      console.error(`Business not found: ${id}`);
      process.exit(1);
    }

    let maxPages: number;
    if (args.pages) {
      maxPages = Number(args.pages);
      if (Number.isNaN(maxPages) || maxPages < 1) {
        console.error("--pages must be a positive number");
        process.exit(1);
      }
    } else {
      maxPages = Number(getConfig(db, "max-pages"));
    }

    try {
      const scraped = scrapeReviews(biz.yelpUrl, maxPages);
      const newReviews = syncReviews(db, biz.id, scraped);
      console.log(JSON.stringify(newReviews));
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  }
});
