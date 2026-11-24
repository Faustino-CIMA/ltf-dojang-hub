import { nationalityCodeFromStored, nationalityLabel } from "@/lib/nationalities";

/** The same envelope lines the invoice PDF prints. */
export type PostalAddress = {
  street?: string;
  house_number?: string;
  line2?: string;
  postal_code?: string;
  locality?: string;
  country?: string;
};

export type DeliveryChoice = "email" | "post" | "hand";

/** The button, the helper, and the stored choice are this one value. */
export function shownDelivery(choice: string | null | undefined): DeliveryChoice {
  if (choice === "post" || choice === "hand") {
    return choice;
  }
  return "email";
}

export function postalAddressLines(address: PostalAddress, locale: string): string[] {
  const number = (address.house_number || "").trim();
  const street = (address.street || "").trim();
  const line1 = number && street ? `${number}, ${street}` : street || number;
  const extra = (address.line2 || "").trim();
  let postal = (address.postal_code || "").trim();
  const locality = (address.locality || "").trim();
  if (/^\d{4}$/.test(postal)) {
    postal = `L-${postal}`;
  }
  const postalLine = [postal, locality].filter(Boolean).join(" ");
  const storedCountry = (address.country || "").trim();
  const code = nationalityCodeFromStored(storedCountry);
  const country = nationalityLabel(code || storedCountry, locale);
  return [line1, extra, postalLine, country].filter((line) => line.length > 0);
}
