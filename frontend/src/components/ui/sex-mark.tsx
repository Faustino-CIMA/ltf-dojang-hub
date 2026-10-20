type SexMarkProps = {
  sex: "M" | "F";
  label: string;
};

export function SexMark({ sex, label }: SexMarkProps) {
  return (
    <span
      aria-label={label}
      title={label}
      className="inline-flex h-[var(--control-height-sm)] w-[var(--control-height-sm)] items-center justify-center text-xl font-semibold leading-none"
    >
      {sex === "F" ? "♀" : "♂"}
    </span>
  );
}
