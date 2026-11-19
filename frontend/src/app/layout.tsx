import type { ReactNode } from "react";

/** Passes children through. Locale pages keep their own document shell. */
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
