import { postalAddressLines, type PostalAddress } from "@/lib/postal-address";

export function PostalAddressBlock({
  address,
  locale,
  className = "text-sm text-foreground",
}: {
  address: PostalAddress;
  locale: string;
  className?: string;
}) {
  const lines = postalAddressLines(address, locale);
  if (lines.length === 0) {
    return null;
  }
  return <p className={`whitespace-pre-line ${className}`}>{lines.join("\n")}</p>;
}
