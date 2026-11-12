declare module "canvas-confetti" {
  type ConfettiOptions = {
    particleCount?: number;
    spread?: number;
    startVelocity?: number;
    decay?: number;
    scalar?: number;
    angle?: number;
    ticks?: number;
    gravity?: number;
    disableForReducedMotion?: boolean;
    origin?: { x?: number; y?: number };
    colors?: string[];
  };

  interface ConfettiFunction {
    (options?: ConfettiOptions): Promise<null> | null;
    reset: () => void;
  }

  const confetti: ConfettiFunction;
  export default confetti;
}
