export type SavedSignIn = {
  token: string;
  username: string;
  email: string;
};

const SETUP_KEY = "ltf-account-ready";
const RESET_KEY = "ltf-password-ready";

function readSaved(key: string, token: string): SavedSignIn | null {
  if (typeof sessionStorage === "undefined" || !token) {
    return null;
  }
  try {
    const parsed = JSON.parse(sessionStorage.getItem(key) || "") as SavedSignIn;
    if (!parsed || parsed.token !== token) {
      return null;
    }
    return {
      token,
      username: String(parsed.username || ""),
      email: String(parsed.email || ""),
    };
  } catch {
    return null;
  }
}

function writeSaved(key: string, value: SavedSignIn) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // A private-mode store can refuse the write. The success card still shows.
  }
}

export function rememberAccountReady(value: SavedSignIn) {
  writeSaved(SETUP_KEY, value);
}

export function recallAccountReady(token: string) {
  return readSaved(SETUP_KEY, token);
}

export function rememberPasswordReady(value: SavedSignIn) {
  writeSaved(RESET_KEY, value);
}

export function recallPasswordReady(token: string) {
  return readSaved(RESET_KEY, token);
}

export function signInHref(locale: string, username: string) {
  const base = `/${locale}/login`;
  const name = username.trim();
  if (!name) {
    return base;
  }
  return `${base}?username=${encodeURIComponent(name)}`;
}
