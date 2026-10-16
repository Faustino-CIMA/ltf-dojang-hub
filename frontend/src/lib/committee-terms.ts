import { formatFullName, fullNameSortKey, type PersonName } from "@/lib/person-name";

export type TermDates = {
  started_on: string;
  ended_on: string | null;
};

export function todayIso(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Active while start <= day < end. An empty end means the term is still open. */
export function isActiveOn(term: TermDates, day: string): boolean {
  if (!term.started_on || term.started_on > day) {
    return false;
  }
  if (!term.ended_on) {
    return true;
  }
  return term.ended_on > day;
}

/** Still open on day, including a term that has not started yet. */
export function isOpenTerm(term: TermDates, day: string): boolean {
  return !term.ended_on || term.ended_on > day;
}

export type TermStatus = "current" | "upcoming" | "past";

export function termStatus(term: TermDates, day: string): TermStatus {
  if (isActiveOn(term, day)) {
    return "current";
  }
  if (term.started_on > day && isOpenTerm(term, day)) {
    return "upcoming";
  }
  return "past";
}

export function committeeRowActionKeys(term: TermDates & { vacant: boolean }, day: string): Array<"edit" | "replace" | "end" | "delete"> {
  const keys: Array<"edit" | "replace" | "end" | "delete"> = ["edit"];
  if (isOpenTerm(term, day)) {
    if (!term.vacant) {
      keys.push("replace");
    }
    keys.push("end");
  }
  keys.push("delete");
  return keys;
}

export function mandateHolderName(mandate: {
  member?: number | null;
  member_first_name?: string;
  member_last_name?: string;
  member_name?: string;
  person?: number | null;
  person_first_name?: string;
  person_last_name?: string;
  person_name?: string;
}): string {
  const memberName = namedPerson(mandate.member_first_name, mandate.member_last_name);
  if (memberName) {
    return memberName;
  }
  const personName = namedPerson(mandate.person_first_name, mandate.person_last_name);
  if (personName) {
    return personName;
  }
  return mandate.member_name || mandate.person_name || "";
}

export function mandateSortName(mandate: {
  member_first_name?: string;
  member_last_name?: string;
  person_first_name?: string;
  person_last_name?: string;
  member_name?: string;
  person_name?: string;
}): string {
  if (mandate.member_last_name || mandate.member_first_name) {
    return fullNameSortKey({ first_name: mandate.member_first_name, last_name: mandate.member_last_name });
  }
  if (mandate.person_last_name || mandate.person_first_name) {
    return fullNameSortKey({ first_name: mandate.person_first_name, last_name: mandate.person_last_name });
  }
  return mandate.member_name || mandate.person_name || "";
}

function namedPerson(first?: string, last?: string): string {
  const person: PersonName = { first_name: first ?? "", last_name: last ?? "" };
  return formatFullName(person);
}
