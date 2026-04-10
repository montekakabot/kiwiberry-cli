import { defineCommand } from "citty";
import { homedir } from "os";
import { join } from "path";
import { getDatabase } from "../db";
import { listDraftResponses } from "../services/response";

function getDb() {
  return getDatabase(join(homedir(), ".kiwiberry"));
}

export default defineCommand({
  meta: { description: "List draft responses for a review" },
  args: {
    reviewId: { type: "positional", description: "Review ID", required: true }
  },
  run({ args }) {
    const db = getDb();

    const id = Number(args.reviewId);
    if (Number.isNaN(id)) {
      console.error("Review ID must be a number");
      process.exit(1);
    }

    try {
      const drafts = listDraftResponses(db, id);
      console.log(JSON.stringify(drafts));
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  }
});
