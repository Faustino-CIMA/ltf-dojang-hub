export function staffFunctionMessageKey(name: string | null | undefined): string {
  if (name === "secretary") return "staffFunctionSecretary";
  if (name === "coach") return "staffFunctionCoach";
  if (name === "medic") return "staffFunctionMedic";
  if (name === "media" || name === "photographer") return "staffFunctionMedia";
  if (name === "other") return "staffFunctionOther";
  return "";
}

export function staffFunctionLabel(
  t: (key: string) => string,
  name: string | null | undefined
): string {
  const key = staffFunctionMessageKey(name);
  return key ? t(key) : "";
}
