"use client";

import { useState, type ReactElement } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function shouldShowLabelTip(force: boolean, scrollWidth: number, clientWidth: number) {
  if (force) {
    return true;
  }
  if (clientWidth <= 0) {
    return false;
  }
  return scrollWidth > clientWidth + 1;
}

function labelNode(current: HTMLElement) {
  if (current.matches("[data-nav-label]")) {
    return current;
  }
  return current.querySelector<HTMLElement>("[data-nav-label]");
}

/** Full menu name, only when the visible label does not fit. Collapsed icons always show it. */
export function SidebarLabelTip({
  text,
  force = false,
  side = "bottom",
  children,
}: {
  text: string;
  force?: boolean;
  side?: "bottom" | "right";
  children: ReactElement;
}) {
  const [open, setOpen] = useState(false);

  const reveal = (current: HTMLElement) => {
    const label = labelNode(current);
    setOpen(shouldShowLabelTip(force, label?.scrollWidth ?? 0, label?.clientWidth ?? 0));
  };

  return (
    <Popover open={open} onOpenChange={(next) => { if (!next) setOpen(false); }}>
      <PopoverTrigger
        asChild
        onMouseEnter={(event) => reveal(event.currentTarget as HTMLElement)}
        onMouseLeave={() => setOpen(false)}
        onFocus={(event) => reveal(event.currentTarget as HTMLElement)}
        onBlur={() => setOpen(false)}
      >
        {children}
      </PopoverTrigger>
      <PopoverContent
        side={side}
        align="start"
        role="tooltip"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        className="pointer-events-none w-max min-w-0 max-w-[18rem] px-3 py-2 text-sm leading-snug"
      >
        {text}
      </PopoverContent>
    </Popover>
  );
}
