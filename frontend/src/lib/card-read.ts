/**
 * Turn text read on the phone into card fields. The picture never reaches this module.
 * The country of the stored number picks the template.
 */

export type CardCountry = "LU" | "DE" | "FR" | "BE";

export type CardRead =
  | {
      ok: true;
      firstNames: string;
      lastNames: string;
      number: string;
      dateOfBirth: string;
      sex: "" | "M" | "F";
    }
  | { ok: false; reason: "wrong_card" | "unreadable" | "health_card" };

const VERHOEFF_D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const VERHOEFF_P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];
const VERHOEFF_INV = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9];
const DE_FACTORS = [2, 1, 2, 5, 7, 1, 2, 1, 2, 1, 2, 1];

const LAST_LABELS = ["nom de famille", "familienname", "nachname", "family name", "naam", "nom", "name"];
const FIRST_LABELS = ["prenoms", "prenom", "vornamen", "vorname", "voornamen", "given names", "given name", "voornaam"];
const TITLE_SKIP =
  /securite|sociale|grand|duche|vitale|assurance|maladie|identit|registre|rijksregister|belg|carte|versicherung|rente|nummer|number|date|naissance|geburt|issue|delivr|valable|expir|european|europeenne|health|gesundheit|kranken/;

function fold(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function verhoeffDigit(number: string) {
  let checksum = 0;
  const reversed = number.split("").reverse();
  reversed.forEach((char, index) => {
    checksum = VERHOEFF_D[checksum][VERHOEFF_P[(index + 1) % 8][Number(char)]];
  });
  return String(VERHOEFF_INV[checksum]);
}

function luhnDigit(number: string) {
  let total = 0;
  number
    .split("")
    .reverse()
    .forEach((char, index) => {
      const product = Number(char) * (index % 2 === 0 ? 2 : 1);
      total += Math.floor(product / 10) + (product % 10);
    });
  return String((10 - (total % 10)) % 10);
}

function validDate(year: number, month: number, day: number) {
  const value = new Date(Date.UTC(year, month - 1, day));
  return value.getUTCFullYear() === year && value.getUTCMonth() === month - 1 && value.getUTCDate() === day;
}

export function validLuxembourgNumber(compact: string) {
  if (!/^\d{13}$/.test(compact)) {
    return false;
  }
  const year = Number(compact.slice(0, 4));
  const month = Number(compact.slice(4, 6));
  const day = Number(compact.slice(6, 8));
  if (!validDate(year, month, day)) {
    return false;
  }
  const body = compact.slice(0, 11);
  return compact.slice(11) === luhnDigit(body) + verhoeffDigit(body);
}

export function validGermanPensionNumber(compact: string) {
  if (!/^\d{8}[A-Z]\d{3}$/.test(compact)) {
    return false;
  }
  const letter = compact.charCodeAt(8) - 64;
  const digits = compact.slice(0, 8) + String(letter).padStart(2, "0") + compact.slice(9, 11);
  let total = 0;
  digits.split("").forEach((char, index) => {
    const product = Number(char) * DE_FACTORS[index];
    total += Math.floor(product / 10) + (product % 10);
  });
  return compact[11] === String(total % 10);
}

function frenchKey(body: string) {
  let value: number;
  if (body.slice(5, 7) === "2A" || body.slice(5, 7) === "2B") {
    const replaced = `${body.slice(0, 6)}0${body.slice(7)}`;
    if (!/^\d{13}$/.test(replaced)) {
      return "";
    }
    value = Number(replaced) - (body[6] === "A" ? 1000000 : 2000000);
  } else if (/^\d{13}$/.test(body)) {
    value = Number(body);
  } else {
    return "";
  }
  return String(97 - (value % 97)).padStart(2, "0");
}

export function validFrenchNumber(compact: string) {
  if (compact.length !== 15) {
    return false;
  }
  const month = Number(compact.slice(3, 5));
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return false;
  }
  return compact.slice(13) === frenchKey(compact.slice(0, 13));
}

function belgianCheck(firstNine: string, born2000OrLater: boolean) {
  const base = Number((born2000OrLater ? "2" : "") + firstNine);
  return String(97 - (base % 97)).padStart(2, "0");
}

export function validBelgianNumber(compact: string) {
  if (!/^\d{11}$/.test(compact)) {
    return false;
  }
  const year = Number(compact.slice(0, 2));
  const month = Number(compact.slice(2, 4));
  const day = Number(compact.slice(4, 6));
  if (!validDate(1900 + year, month, day) && !validDate(2000 + year, month, day)) {
    return false;
  }
  const check = compact.slice(9);
  return check === belgianCheck(compact.slice(0, 9), false) || check === belgianCheck(compact.slice(0, 9), true);
}

function linesOf(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function valueAfter(lines: string[], labels: string[]) {
  for (const line of lines) {
    const folded = fold(line);
    for (const label of labels) {
      const at = folded.indexOf(label);
      if (at < 0) {
        continue;
      }
      const before = at === 0 || /[\s:]/.test(folded[at - 1] || "");
      const after = folded[at + label.length] || "";
      if (!before || (after && !/[\s:]/.test(after))) {
        continue;
      }
      const raw = line.slice(at + label.length).replace(/^[\s:.-]+/, "").trim();
      if (raw) {
        return raw;
      }
    }
  }
  return "";
}

function unlabeledNames(lines: string[]) {
  const kept = lines.filter((line) => {
    const folded = fold(line);
    if (TITLE_SKIP.test(folded)) {
      return false;
    }
    const letters = folded.replace(/[^a-z]/g, "");
    const digits = folded.replace(/\D/g, "");
    return letters.length >= 2 && digits.length < 6;
  });
  if (kept.length >= 2) {
    return { lastNames: kept[0], firstNames: kept[1] };
  }
  if (kept.length === 1) {
    const parts = kept[0].split(/\s+/);
    if (parts.length >= 2 && parts[0] === parts[0].toUpperCase() && parts[1] !== parts[1].toUpperCase()) {
      return { lastNames: parts[0], firstNames: parts.slice(1).join(" ") };
    }
  }
  return { lastNames: "", firstNames: "" };
}

function printedDate(text: string) {
  const dayFirst = text.match(/\b(\d{2})[./-](\d{2})[./-](\d{4})\b/);
  if (dayFirst) {
    const day = Number(dayFirst[1]);
    const month = Number(dayFirst[2]);
    const year = Number(dayFirst[3]);
    if (validDate(year, month, day)) {
      return `${dayFirst[3]}-${dayFirst[2]}-${dayFirst[1]}`;
    }
  }
  const yearFirst = text.match(/\b(\d{4})[./-](\d{2})[./-](\d{2})\b/);
  if (yearFirst && validDate(Number(yearFirst[1]), Number(yearFirst[2]), Number(yearFirst[3]))) {
    return `${yearFirst[1]}-${yearFirst[2]}-${yearFirst[3]}`;
  }
  return "";
}

function printedSex(text: string): "" | "M" | "F" {
  const folded = fold(text);
  if (/\b(weiblich|feminin|femme|female|vrouwelijk)\b/.test(folded)) {
    return "F";
  }
  if (/\b(mannlich|masculin|homme|male|mannelijk)\b/.test(folded)) {
    return "M";
  }
  const marked = folded.match(/\b(?:sexe|geschlecht|sex|geslacht)\s*[:\s]\s*([mf])\b/);
  if (marked) {
    return marked[1] === "f" ? "F" : "M";
  }
  return "";
}

function namesFrom(text: string) {
  const lines = linesOf(text);
  const labeledLast = valueAfter(lines, LAST_LABELS);
  const labeledFirst = valueAfter(lines, FIRST_LABELS);
  if (labeledLast && labeledFirst) {
    return { lastNames: labeledLast, firstNames: labeledFirst };
  }
  return unlabeledNames(lines);
}

function finish(text: string, number: string, sex: "" | "M" | "F"): CardRead {
  const names = namesFrom(text);
  if (!names.firstNames || !names.lastNames) {
    return { ok: false, reason: "unreadable" };
  }
  return {
    ok: true,
    firstNames: names.firstNames,
    lastNames: names.lastNames,
    number,
    dateOfBirth: printedDate(text),
    sex,
  };
}

function asDigit(char: string) {
  if (char >= "0" && char <= "9") {
    return char;
  }
  if (char === "O" || char === "o") {
    return "0";
  }
  if (char === "I" || char === "l" || char === "|") {
    return "1";
  }
  if (char === "S" || char === "s") {
    return "5";
  }
  if (char === "B") {
    return "8";
  }
  return "";
}

function findLuxembourg(text: string) {
  let run = "";
  const consider = (candidate: string) => validLuxembourgNumber(candidate);
  for (let index = 0; index < text.length; index += 1) {
    const digit = asDigit(text[index]);
    if (!digit) {
      run = "";
      continue;
    }
    run += digit;
    if (run.length > 13) {
      run = run.slice(run.length - 13);
    }
    if (run.length === 13 && consider(run)) {
      return run;
    }
  }
  return "";
}

function dateFromLuxembourgNumber(number: string) {
  return `${number.slice(0, 4)}-${number.slice(4, 6)}-${number.slice(6, 8)}`;
}

function findGerman(text: string) {
  const compact = text.toUpperCase().replace(/[^A-Z0-9]/g, "");
  for (let index = 0; index + 12 <= compact.length; index += 1) {
    const candidate = compact.slice(index, index + 12);
    if (validGermanPensionNumber(candidate)) {
      return candidate;
    }
  }
  return "";
}

function findFrench(text: string) {
  const upper = text.toUpperCase();
  const corsica = upper.match(/\d{5}2[AB]\d{8}/);
  if (corsica && validFrenchNumber(corsica[0])) {
    return corsica[0];
  }
  const compact = upper.replace(/[^\d]/g, "");
  for (let index = 0; index + 15 <= compact.length; index += 1) {
    const candidate = compact.slice(index, index + 15);
    if (validFrenchNumber(candidate)) {
      return candidate;
    }
  }
  return "";
}

function findBelgian(text: string) {
  const compact = text.replace(/[^\d]/g, "");
  for (let index = 0; index + 11 <= compact.length; index += 1) {
    const candidate = compact.slice(index, index + 11);
    if (validBelgianNumber(candidate)) {
      return candidate;
    }
  }
  return "";
}

function hasAny(folded: string, phrases: string[]) {
  return phrases.some((phrase) => folded.includes(phrase));
}

export function readCardText(country: CardCountry, text: string): CardRead {
  const folded = fold(text);
  if (country === "LU") {
    const national = hasAny(folded, ["securite sociale", "grand-duche", "grand duche"]);
    const european = hasAny(folded, ["carte europeenne", "european health"]);
    if (european && !national) {
      return { ok: false, reason: "wrong_card" };
    }
    const number = findLuxembourg(text);
    if (!number) {
      return { ok: false, reason: "unreadable" };
    }
    const names = namesFrom(text);
    return {
      ok: true,
      firstNames: names.firstNames,
      lastNames: names.lastNames,
      number,
      dateOfBirth: printedDate(text) || dateFromLuxembourgNumber(number),
      sex: "",
    };
  }
  if (country === "DE") {
    const pension = hasAny(folded, [
      "versicherungsnummernachweis",
      "rentenversicherung",
      "sozialversicherung",
      "versicherungsnummer",
    ]);
    const number = findGerman(text);
    const healthWords = hasAny(folded, ["gesundheitskarte", "krankenversichertennummer"]);
    const healthShape = /\b[A-Z]\d{9}\b/.test(text.toUpperCase());
    if ((healthWords || healthShape) && !number) {
      return { ok: false, reason: "health_card" };
    }
    if (!pension || !number) {
      return { ok: false, reason: number ? "wrong_card" : "unreadable" };
    }
    return finish(text, number, "");
  }
  if (country === "FR") {
    const vitale = hasAny(folded, ["vitale", "assurance maladie"]);
    const number = findFrench(text);
    if (!vitale) {
      return { ok: false, reason: number ? "wrong_card" : "unreadable" };
    }
    if (!number) {
      return { ok: false, reason: "unreadable" };
    }
    return finish(text, number, printedSex(text));
  }
  const number = findBelgian(text);
  const identity = hasAny(folded, ["identit", "isi", "registre national", "rijksregister", "belgique", "belgie", "belgium"]);
  if (!number) {
    return { ok: false, reason: "unreadable" };
  }
  if (!identity) {
    const names = namesFrom(text);
    if (!names.firstNames || !names.lastNames) {
      return { ok: false, reason: "unreadable" };
    }
  }
  return finish(text, number, printedSex(text));
}

export function sanitizeStoredNumber(country: string, value: string) {
  if (country === "DE") {
    return value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
  }
  const max = country === "FR" ? 15 : country === "BE" ? 11 : 13;
  return value.replace(/\D/g, "").slice(0, max);
}
