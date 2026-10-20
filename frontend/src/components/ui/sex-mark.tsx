type SexMarkProps = {
  sex: "M" | "F";
  label: string;
};

export function SexMark({ sex, label }: SexMarkProps) {
  return (
    <span
      aria-label={label}
      title={label}
      className="inline-flex h-5 min-w-5 items-center justify-center rounded-[var(--radius-chip)] border border-[var(--border)] bg-secondary px-1.5 text-xs font-medium leading-none text-[var(--default-foreground)]"
    >
      {sex === "F" ? "♀" : "♂"}
    </span>
  );
}
