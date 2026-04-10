import { defineCommand } from "citty";
import { homedir } from "os";
import { join } from "path";
import { getDatabase } from "../db";
import { listReviews } from "../services/review";

function getDb() {
  return getDatabase(join(homedir(), ".kiwiberry"));
}

export default defineCommand({
  meta: { description: "List all stored reviews for a business" },
  args: {
    b: { type: "string", description: "Business ID", required: true }
  },
  run({ args }) {
    const db = getDb();

    const id = Number(args.b);
    if (Number.isNaN(id)) {
      console.error("Business ID must be a number");
      process.exit(1);
    }

    try {
      const reviews = listReviews(db, id);
      console.log(JSON.stringify(reviews));
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  }
});
