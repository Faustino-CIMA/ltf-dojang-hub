export const THEME_STORAGE_KEY = "ltf-theme";

export type ThemeChoice = "light" | "dark" | "system";

export function readThemeChoice(): ThemeChoice {
  if (typeof window === "undefined") {
    return "system";
  }
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === "light" || stored === "dark" || stored === "system") {
    return stored;
  }
  return "system";
}

export function resolveTheme(choice: ThemeChoice): "light" | "dark" {
  if (choice === "system") {
    if (typeof window.matchMedia !== "function") {
      return "light";
    }
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return choice;
}

export function applyTheme(choice: ThemeChoice) {
  const mode = resolveTheme(choice);
  const root = document.documentElement;
  root.classList.toggle("dark", mode === "dark");
  root.dataset.theme = mode;
  root.style.colorScheme = mode;
}

const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function persistTheme(choice: ThemeChoice) {
  window.localStorage.setItem(THEME_STORAGE_KEY, choice);
  applyTheme(choice);
  emit();
}

export function subscribeTheme(listener: () => void) {
  listeners.add(listener);
  if (typeof window.matchMedia !== "function") {
    return () => {
      listeners.delete(listener);
    };
  }
  applyTheme(readThemeChoice());
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const onMedia = () => {
    if (readThemeChoice() === "system") {
      applyTheme("system");
    }
    listener();
  };
  media.addEventListener("change", onMedia);
  return () => {
    listeners.delete(listener);
    media.removeEventListener("change", onMedia);
  };
}
