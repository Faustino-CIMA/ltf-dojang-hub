import type { ReactNode } from "react";

/** These routes only redirect. They are outside the locale shell. */
export default function CheckoutRedirectLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
