/** World Taekwondo age bands used on squad selections.

Kyorugi: WT Competition Rules & Interpretation, in force 30 September 2024, Article 4.1.5.
Cadet 12–14, Junior 15–17, Senior at least 17, counted in the year of the competition.
Poomsae recognised divisions start at the same Cadet and Junior bands, then Under 30 (18–30)
rather than a single Senior class. The app's Youth value is not one of those divisions.
*/

export const WT_AGE_RANGES = {
  cadet: "12–14",
  junior: "15–17",
  senior: "17+",
} as const;

export function ageClassOptionLabel(name: string, code: string): string {
  const range = WT_AGE_RANGES[code as keyof typeof WT_AGE_RANGES];
  if (!range || !name) return name;
  return `${name} (${range})`;
}

/** Age in the season year, the way World Taekwondo counts it. */
export function suggestAgeClass(dateOfBirth: string | null | undefined, seasonYear: number): string {
  if (!dateOfBirth || !seasonYear) return "";
  const year = Number(String(dateOfBirth).slice(0, 4));
  if (!Number.isInteger(year) || year < 1900 || year > seasonYear) return "";
  const age = seasonYear - year;
  if (age < 12) return "youth";
  if (age <= 14) return "cadet";
  if (age <= 17) return "junior";
  return "senior";
}
