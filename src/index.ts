import { defineCommand, runMain } from "citty";

const main = defineCommand({
  meta: {
    name: "kiwiberry",
    version: "0.1.0",
    description: "Yelp review tracker CLI — scrape reviews, draft responses, stay on top of feedback."
  },
  subCommands: {}
});

void runMain(main);
