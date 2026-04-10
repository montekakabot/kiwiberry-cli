import { defineCommand } from "citty";
import { defaultDataDir, getDatabase } from "../db";
import { addDraftResponse } from "../services/response";

function getDb() {
  return getDatabase(defaultDataDir());
}

export default defineCommand({
  meta: { description: "Save a draft response for a review" },
  args: {
    reviewId: { type: "positional", description: "Review ID", required: true },
    text: { type: "positional", description: "Response text (reads from stdin if omitted)", required: false }
  },
  async run({ args }) {
    const db = getDb();

    const id = Number(args.reviewId);
    if (Number.isNaN(id)) {
      console.error("Review ID must be a number");
      process.exit(1);
    }

    const inline = args.text as string | undefined;
    const text = inline ?? await Bun.stdin.text();

    try {
      const draft = addDraftResponse(db, id, text);
      console.log(JSON.stringify(draft));
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  }
});
