import MiniSearch from "minisearch";

import { sectionVisible, type HelpSection } from "@/lib/help-manual";

export function searchHelp(sections: HelpSection[], query: string, desk: string | null): HelpSection[] {
  const visible = sections.filter((section) => sectionVisible(section, desk));
  const text = query.trim();
  if (!text) {
    return [];
  }
  const index = new MiniSearch<{ id: string; heading: string; text: string }>({
    fields: ["heading", "text"],
    storeFields: ["id"],
    searchOptions: { prefix: true, fuzzy: 0.2, boost: { heading: 2 } },
  });
  index.addAll(visible.map((section) => ({ id: section.id, heading: section.heading, text: section.text })));
  const byId = new Map(visible.map((section) => [section.id, section]));
  return index
    .search(text)
    .map((hit) => byId.get(String(hit.id)))
    .filter((section): section is HelpSection => section != null);
}
