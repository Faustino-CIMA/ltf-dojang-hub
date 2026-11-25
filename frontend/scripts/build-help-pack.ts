/** Rebuilds the help pack from the four manuals. Not part of `npm run build`: the frontend image does not contain `docs/`. */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { flattenMessages, parseManual } from "../src/lib/help-manual.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const messagesDir = resolve(root, "frontend/src/messages");
const manualDir = resolve(root, "docs/user-manual/content");

const english = flattenMessages(JSON.parse(readFileSync(resolve(messagesDir, "en.json"), "utf8")));
const luxembourgish = flattenMessages(JSON.parse(readFileSync(resolve(messagesDir, "lb.json"), "utf8")));

const pack = {
  en: parseManual(readFileSync(resolve(manualDir, "en.md"), "utf8"), english),
  fr: parseManual(readFileSync(resolve(manualDir, "fr.md"), "utf8"), english),
  de: parseManual(readFileSync(resolve(manualDir, "de.md"), "utf8"), english),
  lb: parseManual(readFileSync(resolve(manualDir, "lb.md"), "utf8"), luxembourgish),
};

writeFileSync(resolve(root, "frontend/src/content/help-pack.json"), `${JSON.stringify(pack)}\n`);
console.log(`Help pack: ${pack.en.length} English sections.`);
