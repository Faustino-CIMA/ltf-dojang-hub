import type { ImportIssue } from "@/lib/import-api";

type IssueTranslator = (key: string, values?: Record<string, string>) => string;

export function importIssueMessage(t: IssueTranslator, issue: ImportIssue): string {
  if (issue.code === "gender") {
    const value = (issue.value || "").trim();
    return value ? t("issueGender", { value }) : t("issueGenderBlank");
  }
  if (issue.code === "licence_taken") {
    return t("issueLicenceTaken", { name: issue.name || "—", id: issue.id || "—" });
  }
  if (issue.code === "duplicate") {
    return t("issueDuplicate", { name: issue.name || "—", id: issue.id || "—" });
  }
  return issue.value || issue.code;
}
