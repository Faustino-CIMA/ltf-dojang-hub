/** Age bands shown on a squad selection.

Kyorugi World Taekwondo bands are Article 4.1.5 of the Competition Rules & Interpretation
in force 30 September 2024: Cadet 12–14, Junior 15–17, Senior at least 17, counted in
the year of the competition.

Pupils and Minimes are regional classes from the Keumgang Open Kyorugi outline
(Taekwondo Vlaanderen, Lommel, 16 January 2027): Pupils born 2020–2019 (7–8) and
Minimes born 2018–2016 (9–11) for a 2027 event. They are not World Taekwondo divisions.
Youth is an app class for athletes younger than Pupils.

A competitor in the final year of a class may compete one class higher. Pupils may not.
The suggestion follows that rule. Any class can still be chosen by hand.
*/

export const AGE_CLASS_ORDER = ["pupils", "minimes", "cadet", "junior", "senior", "youth"] as const;

export const AGE_RANGES = {
  pupils: "7–8",
  minimes: "9–11",
  cadet: "12–14",
  junior: "15–17",
  senior: "17+",
} as const;

const REGIONAL_AGE_CLASSES = new Set<string>(["pupils", "minimes"]);

const AGE_CLASS_KEYS: Record<string, string> = {
  pupils: "nationalTeamAgePupils",
  minimes: "nationalTeamAgeMinimes",
  cadet: "nationalTeamAgeCadet",
  junior: "nationalTeamAgeJunior",
  senior: "nationalTeamAgeSenior",
  youth: "nationalTeamAgeYouth",
};

export function ageClassOptionLabel(name: string, code: string, regionalNote = ""): string {
  const range = AGE_RANGES[code as keyof typeof AGE_RANGES];
  if (!range || !name) return name;
  if (REGIONAL_AGE_CLASSES.has(code) && regionalNote) {
    return `${name} (${range}, ${regionalNote})`;
  }
  return `${name} (${range})`;
}

export function formatAgeClassLabel(t: (key: string) => string, code: string): string {
  if (!code) return "-";
  const key = AGE_CLASS_KEYS[code];
  const name = key ? t(key) : code;
  const note = REGIONAL_AGE_CLASSES.has(code) ? t("nationalTeamAgeRegional") : "";
  return ageClassOptionLabel(name, code, note);
}

/** Age in the season year. The last year of a class suggests the next class, except Pupils. */
export function suggestAgeClass(dateOfBirth: string | null | undefined, seasonYear: number): string {
  if (!dateOfBirth || !seasonYear) return "";
  const year = Number(String(dateOfBirth).slice(0, 4));
  if (!Number.isInteger(year) || year < 1900 || year > seasonYear) return "";
  const age = seasonYear - year;
  if (age < 7) return "youth";
  if (age <= 8) return "pupils";
  if (age <= 10) return "minimes";
  if (age === 11) return "cadet";
  if (age <= 13) return "cadet";
  if (age === 14) return "junior";
  if (age <= 16) return "junior";
  if (age === 17) return "senior";
  return "senior";
}
