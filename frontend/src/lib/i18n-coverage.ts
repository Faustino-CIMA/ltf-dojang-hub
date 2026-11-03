export type MessageTree = Record<string, unknown>;

export type CoverageRow = {
  area: string;
  total: number;
  present: number;
  missing: number;
};

export function flattenMessages(tree: MessageTree, prefix = ""): Record<string, string> {
  const flat: Record<string, string> = {};
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      Object.assign(flat, flattenMessages(value as MessageTree, path));
    } else if (typeof value === "string") {
      flat[path] = value;
    }
  }
  return flat;
}

export function coverageByArea(source: MessageTree, locale: MessageTree): CoverageRow[] {
  const english = flattenMessages(source);
  const translated = flattenMessages(locale);
  const areas = new Map<string, CoverageRow>();
  for (const key of Object.keys(english)) {
    const area = key.split(".")[0] ?? key;
    const row = areas.get(area) ?? { area, total: 0, present: 0, missing: 0 };
    row.total += 1;
    if (key in translated) {
      row.present += 1;
    } else {
      row.missing += 1;
    }
    areas.set(area, row);
  }
  return [...areas.values()].sort((left, right) => right.missing - left.missing || left.area.localeCompare(right.area));
}

export function formatCoverage(localeName: string, rows: CoverageRow[]): string {
  const lines = [`${localeName}`];
  for (const row of rows) {
    lines.push(`  ${row.area}: ${row.present}/${row.total} missing ${row.missing}`);
  }
  return lines.join("\n");
}
