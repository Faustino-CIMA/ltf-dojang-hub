import { framingGuideState, type FaceGuideReason } from "@/lib/face-check";

/**
 * Head-and-shoulders outline for the 945×1181 print crop.
 * Amber while the person should move, green when Save's rule passes.
 * The stroke is never the danger or accent token: those are red in this theme.
 */
export function FramingGuide({ reason }: { reason: FaceGuideReason }) {
  const state = framingGuideState(reason);
  const tone = state === "ready" ? "var(--success)" : state === "adjust" ? "var(--warning)" : "var(--muted)";
  const dash = state === "ready" ? undefined : "14 10";
  return (
    <svg
      viewBox="0 0 945 1181"
      className="h-full w-full"
      data-testid="framing-guide"
      data-state={state}
      aria-hidden="true"
    >
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        <Outline tone="var(--foreground)" width={10} dash={dash} />
        <Outline tone={tone} width={4} dash={dash} />
      </g>
    </svg>
  );
}

function Outline({ tone, width, dash }: { tone: string; width: number; dash?: string }) {
  return (
    <g stroke={tone} strokeWidth={width}>
      <ellipse cx="472.5" cy="530" rx="190" ry="236" strokeDasharray={dash} />
      <path d="M210 900 Q472.5 790 735 900" strokeDasharray={dash} />
    </g>
  );
}

export function GuideMark({ reason }: { reason: FaceGuideReason }) {
  const state = framingGuideState(reason);
  const tone = state === "ready" ? "var(--success)" : state === "adjust" ? "var(--warning)" : "var(--muted)";
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0" aria-hidden="true" data-testid="framing-guide-mark" data-state={state}>
      {state === "ready" ? (
        <path d="M3 8.2 6.4 11.5 13 4.5" fill="none" stroke={tone} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <circle cx="8" cy="8" r="5.2" fill="none" stroke={tone} strokeWidth="1.8" />
      )}
    </svg>
  );
}
