import { defineCommand } from "citty";
import { defaultDataDir, getDatabase } from "../db";
import { getConfig, setConfig } from "../services/config";

function getDb() {
  return getDatabase(defaultDataDir());
}

const get = defineCommand({
  meta: { description: "Get a config value" },
  args: {
    key: { type: "positional", description: "Config key", required: true }
  },
  run({ args }) {
    const db = getDb();
    try {
      const value = getConfig(db, args.key);
      console.log(JSON.stringify({ key: args.key, value }));
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  }
});

const set = defineCommand({
  meta: { description: "Set a config value" },
  args: {
    key: { type: "positional", description: "Config key", required: true },
    value: { type: "positional", description: "Config value", required: true }
  },
  run({ args }) {
    const db = getDb();
    setConfig(db, args.key, args.value);
    console.log(JSON.stringify({ key: args.key, value: args.value }));
  }
});

export default defineCommand({
  meta: { description: "Manage configuration" },
  subCommands: { get, set }
});
