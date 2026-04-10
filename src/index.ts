import { defineCommand, renderUsage, runMain } from "citty";
import business from "./commands/business";
import config from "./commands/config";
import fetch from "./commands/fetch";

const main = defineCommand({
  meta: {
    name: "kiwiberry",
    version: "0.1.0",
    description: "Yelp review tracker CLI — scrape reviews, draft responses, stay on top of feedback."
  },
  subCommands: { business, config, fetch }
});

void runMain(main, {
  showUsage: async (cmd, parent) => {
    const usage = await renderUsage(cmd, parent);
    console.error(usage);
  }
});
