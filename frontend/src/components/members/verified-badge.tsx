import { ShieldCheck } from "lucide-react";

export function VerifiedBadge({ label, iconOnly = false }: { label: string; iconOnly?: boolean }) {
  if (iconOnly) {
    return (
      <span className="inline-flex items-center text-success" data-verified="true">
        <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="sr-only">{label}</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-success" data-verified="true">
      <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
      <span className="text-xs font-medium">{label}</span>
    </span>
  );
}
