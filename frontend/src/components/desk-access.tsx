"use client";

import { createContext, useContext } from "react";

export const DeskAccessContext = createContext({
  readOnly: false,
  viewOnlyLabel: "View only on this desk",
});

export function useDeskAccess() {
  return useContext(DeskAccessContext);
}
