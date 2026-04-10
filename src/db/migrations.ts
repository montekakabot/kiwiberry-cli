// Migration SQL is imported as text so `bun build --compile` embeds it into the
// binary. Keep this list in sync with drizzle/meta/_journal.json when new
// migrations are generated via `bunx drizzle-kit generate`.
import migration0000 from "../../drizzle/0000_smart_sheva_callister.sql" with { type: "text" };
import migration0001 from "../../drizzle/0001_white_dracula.sql" with { type: "text" };
import migration0002 from "../../drizzle/0002_replace_review_url_with_user_id.sql" with { type: "text" };
import migration0003 from "../../drizzle/0003_drop_location_name.sql" with { type: "text" };
import type { BundledMigration } from "./migrator";

export const bundledMigrations: BundledMigration[] = [
  { idx: 0, tag: "0000_smart_sheva_callister", sql: migration0000 },
  { idx: 1, tag: "0001_white_dracula", sql: migration0001 },
  { idx: 2, tag: "0002_replace_review_url_with_user_id", sql: migration0002 },
  { idx: 3, tag: "0003_drop_location_name", sql: migration0003 }
];
