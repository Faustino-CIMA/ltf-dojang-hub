import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../src/messages");

function flatten(tree, prefix = "") {
  const flat = {};
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      Object.assign(flat, flatten(value, path));
    } else if (typeof value === "string") {
      flat[path] = value;
    }
  }
  return flat;
}

function report(source, locale) {
  const areas = new Map();
  for (const key of Object.keys(source)) {
    const area = key.split(".")[0];
    const row = areas.get(area) ?? { area, total: 0, present: 0, missing: 0 };
    row.total += 1;
    if (key in locale) {
      row.present += 1;
    } else {
      row.missing += 1;
    }
    areas.set(area, row);
  }
  return [...areas.values()].sort((left, right) => right.missing - left.missing || left.area.localeCompare(right.area));
}

const english = flatten(JSON.parse(readFileSync(join(root, "en.json"), "utf8")));
for (const name of ["fr", "de", "lb"]) {
  const rows = report(english, flatten(JSON.parse(readFileSync(join(root, `${name}.json`), "utf8"))));
  const missing = rows.reduce((sum, row) => sum + row.missing, 0);
  console.log(`${name}: ${missing} missing`);
  for (const row of rows) {
    if (row.missing > 0) {
      console.log(`  ${row.area}: ${row.present}/${row.total} missing ${row.missing}`);
    }
  }
}
