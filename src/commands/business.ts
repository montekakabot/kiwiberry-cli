import { defineCommand } from "citty";
import { homedir } from "os";
import { join } from "path";
import { getDatabase } from "../db";
import { addBusiness, listBusinesses, removeBusiness } from "../services/business";

function getDb() {
  return getDatabase(join(homedir(), ".kiwiberry"));
}

const add = defineCommand({
  meta: { description: "Register a business" },
  args: {
    name: { type: "positional", description: "Business name", required: true },
    yelpUrl: { type: "positional", description: "Yelp business URL", required: true }
  },
  run({ args }) {
    const db = getDb();
    try {
      const biz = addBusiness(db, args.name, args.yelpUrl);
      console.log(JSON.stringify(biz));
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  }
});

const list = defineCommand({
  meta: { description: "List all businesses" },
  run() {
    const db = getDb();
    console.log(JSON.stringify(listBusinesses(db)));
  }
});

const remove = defineCommand({
  meta: { description: "Remove a business and all associated data" },
  args: {
    id: { type: "positional", description: "Business ID", required: true }
  },
  run({ args }) {
    const db = getDb();
    const id = Number(args.id);
    if (Number.isNaN(id)) {
      console.error("ID must be a number");
      process.exit(1);
    }
    const removed = removeBusiness(db, id);
    if (removed) {
      console.error("Business removed");
    } else {
      console.error("Business not found");
      process.exit(1);
    }
  }
});

export default defineCommand({
  meta: { description: "Manage businesses" },
  subCommands: { add, list, remove }
});
