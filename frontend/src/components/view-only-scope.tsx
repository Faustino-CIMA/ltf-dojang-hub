"use client";

import { useLayoutEffect, useRef, type FormEvent, type ReactNode } from "react";

import { useDeskAccess } from "@/components/desk-access";

const TEXT_TYPES = new Set([
  "text",
  "search",
  "email",
  "url",
  "tel",
  "password",
  "number",
  "date",
  "datetime-local",
  "time",
  "month",
  "week",
]);

function isWriteLink(href: string) {
  return /\/(import|new)(\/|$|\?)/.test(href);
}

/** Lock controls already on the page. Text stays selectable; the other controls cannot change. */
export function lockViewOnlyTree(root: HTMLElement, label: string) {
  root.querySelectorAll<HTMLInputElement>("input").forEach((field) => {
    const type = (field.type || "text").toLowerCase();
    if (TEXT_TYPES.has(type)) {
      field.readOnly = true;
      field.setAttribute("aria-readonly", "true");
      return;
    }
    if (type === "hidden" || type === "button" || type === "submit" || type === "reset") {
      return;
    }
    field.disabled = true;
    field.title = label;
  });
  root.querySelectorAll<HTMLTextAreaElement>("textarea").forEach((field) => {
    field.readOnly = true;
    field.setAttribute("aria-readonly", "true");
  });
  root.querySelectorAll<HTMLSelectElement>("select").forEach((field) => {
    field.disabled = true;
    field.title = label;
  });
  root.querySelectorAll<HTMLElement>("[contenteditable='true']").forEach((field) => {
    field.setAttribute("contenteditable", "false");
  });
  root.querySelectorAll<HTMLElement>("[role='switch'], [role='combobox'], [data-slot='checkbox']").forEach((field) => {
    if (field instanceof HTMLButtonElement) {
      field.disabled = true;
    }
    field.setAttribute("aria-disabled", "true");
    field.title = label;
  });
  root.querySelectorAll<HTMLButtonElement>("button").forEach((button) => {
    const explicit = button.getAttribute("type");
    const type = (explicit || (button.closest("form") ? "submit" : "button")).toLowerCase();
    const variant = button.getAttribute("data-variant");
    const write = button.getAttribute("data-write") === "true" || variant === "destructive" || type === "submit";
    if (!write) {
      return;
    }
    button.disabled = true;
    button.title = label;
    button.setAttribute("aria-disabled", "true");
  });
  root.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((link) => {
    const href = link.getAttribute("href") || "";
    if (!isWriteLink(href)) {
      return;
    }
    link.setAttribute("aria-disabled", "true");
    link.tabIndex = -1;
    link.title = label;
  });
}

/**
 * One wrapper for the open desk. A disabled fieldset would block selecting the
 * text, so text fields are read-only and every other control is disabled.
 */
export function ViewOnlyScope({ children }: { children: ReactNode }) {
  const { readOnly, viewOnlyLabel } = useDeskAccess();
  const ref = useRef<HTMLFieldSetElement>(null);

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root || !readOnly) {
      return;
    }
    const apply = () => lockViewOnlyTree(root, viewOnlyLabel);
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [readOnly, viewOnlyLabel]);

  const blockWriteLink = (event: FormEvent | React.MouseEvent) => {
    if (!readOnly) {
      return;
    }
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    if (target.closest("a[aria-disabled='true']")) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (event.type === "submit") {
      event.preventDefault();
    }
  };

  return (
    <fieldset
      ref={ref}
      data-view-only={readOnly ? "true" : undefined}
      className="m-0 min-w-0 border-0 p-0"
      onSubmitCapture={blockWriteLink}
      onClickCapture={blockWriteLink}
    >
      {children}
    </fieldset>
  );
}
