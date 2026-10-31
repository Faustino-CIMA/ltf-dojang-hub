import { readDeskReadOnly } from "./active-desk";

export type AuthNoticeTone = "info" | "danger";

type Locale = "en" | "fr" | "de" | "lb";

const INFO_CODES = new Set([
  "mfa_enrol_required",
  "mfa_required",
  "mfa_recovery_required",
  "mfa_sign_in_again",
  "mfa_not_pending",
  "email_not_accepted",
  "desk_read_only",
]);

const COPY: Record<string, Record<Locale, string>> = {
  mfa_enrol_required: {
    en: "This desk opens once two-step sign-in is set up.",
    fr: "Ce bureau s'ouvre une fois la connexion en deux étapes configurée.",
    de: "Dieser Schreibtisch öffnet sich, sobald die Anmeldung in zwei Schritten eingerichtet ist.",
    lb: "Dëse Schreifdësch geet op, soubal d'Umeldung an zwee Schrëtt ariicht ass.",
  },
  mfa_required: {
    en: "Sign in with your authenticator to open this desk.",
    fr: "Connectez-vous avec votre authentificateur pour ouvrir ce bureau.",
    de: "Melden Sie sich mit Ihrem Authenticator an, um diesen Schreibtisch zu öffnen.",
    lb: "Loggt Iech mat Ärem Authenticator an, fir dëse Schreifdësch opzemaachen.",
  },
  mfa_recovery_required: {
    en: "Save your recovery codes, then this desk will open.",
    fr: "Enregistrez vos codes de secours, puis ce bureau s'ouvrira.",
    de: "Speichern Sie Ihre Wiederherstellungscodes, dann öffnet sich dieser Schreibtisch.",
    lb: "Späichert Är Recovery-Coden, da geet dëse Schreifdësch op.",
  },
  mfa_sign_in_again: {
    en: "Sign in again, then set this up while this visit is still fresh.",
    fr: "Reconnectez-vous, puis faites cette étape pendant que la visite est encore récente.",
    de: "Melden Sie sich erneut an und richten Sie das ein, solange dieser Besuch noch frisch ist.",
    lb: "Loggt Iech nach eng Kéier an, an da riicht dat an, solang dës Visite frësch ass.",
  },
  mfa_not_pending: {
    en: "Sign in again, then enter the code.",
    fr: "Reconnectez-vous, puis saisissez le code.",
    de: "Melden Sie sich erneut an und geben Sie dann den Code ein.",
    lb: "Loggt Iech nach eng Kéier an, an da gitt de Code an.",
  },
  email_not_accepted: {
    en: "Email codes are not accepted for this desk.",
    fr: "Les codes e-mail ne sont pas acceptés pour ce bureau.",
    de: "E-Mail-Codes werden für diesen Schreibtisch nicht akzeptiert.",
    lb: "E-Mail-Coden ginn fir dëse Schreifdësch net ugeholl.",
  },
  desk_read_only: {
    en: "This desk is view only.",
    fr: "Ce bureau est en lecture seule.",
    de: "Dieser Schreibtisch ist nur zum Ansehen.",
    lb: "Dëse Schreifdësch ass nëmme fir ze kucken.",
  },
  not_allowed: {
    en: "That action is not available.",
    fr: "Cette action n'est pas disponible.",
    de: "Diese Aktion ist nicht verfügbar.",
    lb: "Dës Aktioun ass net disponibel.",
  },
  incorrect_code: {
    en: "That code was not accepted.",
    fr: "Ce code n'a pas été accepté.",
    de: "Dieser Code wurde nicht akzeptiert.",
    lb: "Dëse Code gouf net ugeholl.",
  },
  incorrect_password: {
    en: "That password was not accepted.",
    fr: "Ce mot de passe n'a pas été accepté.",
    de: "Dieses Passwort wurde nicht akzeptiert.",
    lb: "Dëst Passwuert gouf net ugeholl.",
  },
  rate_limited: {
    en: "Too many attempts. Wait a moment, then try the current code.",
    fr: "Trop de tentatives. Patientez un instant, puis essayez le code actuel.",
    de: "Zu viele Versuche. Warten Sie kurz und versuchen Sie dann den aktuellen Code.",
    lb: "Ze vill Versich. Waart e Moment, an da probéiert de aktuellen Code.",
  },
  too_many_login_attempts: {
    en: "Too many attempts. Wait a moment, then try the current code.",
    fr: "Trop de tentatives. Patientez un instant, puis essayez le code actuel.",
    de: "Zu viele Versuche. Warten Sie kurz und versuchen Sie dann den aktuellen Code.",
    lb: "Ze vill Versich. Waart e Moment, an da probéiert de aktuellen Code.",
  },
  mfa_rate_limited: {
    en: "Too many attempts. Wait a moment, then try the current code.",
    fr: "Trop de tentatives. Patientez un instant, puis essayez le code actuel.",
    de: "Zu viele Versuche. Warten Sie kurz und versuchen Sie dann den aktuellen Code.",
    lb: "Ze vill Versich. Waart e Moment, an da probéiert de aktuellen Code.",
  },
  desk_not_granted: {
    en: "That desk is not open for this account.",
    fr: "Ce bureau n'est pas ouvert pour ce compte.",
    de: "Dieser Schreibtisch ist für dieses Konto nicht geöffnet.",
    lb: "Dëse Schreifdësch ass fir dëse Kont net op.",
  },
  token_sunset: {
    en: "That sign-in has expired. Sign in again.",
    fr: "Cette connexion a expiré. Reconnectez-vous.",
    de: "Diese Anmeldung ist abgelaufen. Melden Sie sich erneut an.",
    lb: "Dës Umeldung ass ofgelaf. Loggt Iech nach eng Kéier an.",
  },
  mfa_grace_already_extended: {
    en: "That grace was already extended once.",
    fr: "Ce délai a déjà été prolongé une fois.",
    de: "Diese Frist wurde bereits einmal verlängert.",
    lb: "Déi Frist gouf schonn eemol verlängert.",
  },
};

const CODES = Object.keys(COPY).sort((left, right) => right.length - left.length);
const KNOWN_TEXT = new Map<string, { code: string; tone: AuthNoticeTone }>();
for (const code of CODES) {
  const tone: AuthNoticeTone = INFO_CODES.has(code) ? "info" : "danger";
  for (const text of Object.values(COPY[code])) {
    KNOWN_TEXT.set(text, { code, tone });
  }
}

export class AuthApiError extends Error {
  code: string;
  tone: AuthNoticeTone;

  constructor(code: string, text: string, tone: AuthNoticeTone) {
    super(text);
    this.name = "AuthApiError";
    this.code = code;
    this.tone = tone;
  }
}

export function readUiLocale(): Locale {
  if (typeof window === "undefined") {
    return "en";
  }
  const match = window.location.pathname.match(/^\/(en|fr|de|lb)(?=\/|$)/);
  if (match?.[1] === "fr" || match?.[1] === "de" || match?.[1] === "lb") {
    return match[1];
  }
  return "en";
}

export function matchAuthCode(message: string): string | null {
  const text = message.trim();
  for (const code of CODES) {
    if (text === code || text.includes(code)) {
      return code;
    }
  }
  return KNOWN_TEXT.get(text)?.code ?? null;
}

const RAW_DENIALS = new Set([
  "Not allowed.",
  "You do not have permission to perform this action.",
]);

export function presentAuthError(message: string, locale: Locale = readUiLocale()): {
  code: string | null;
  text: string;
  tone: AuthNoticeTone;
} {
  const trimmed = message.trim();
  if (readDeskReadOnly() && (RAW_DENIALS.has(trimmed) || trimmed.includes("Not allowed."))) {
    return { code: "desk_read_only", text: COPY.desk_read_only[locale] ?? COPY.desk_read_only.en, tone: "info" };
  }
  if (trimmed === "Not allowed.") {
    return { code: "not_allowed", text: COPY.not_allowed[locale] ?? COPY.not_allowed.en, tone: "danger" };
  }
  const known = KNOWN_TEXT.get(trimmed);
  if (known) {
    return { code: known.code, text: message.trim(), tone: known.tone };
  }
  const code = matchAuthCode(trimmed);
  if (!code) {
    return { code: null, text: message, tone: "danger" };
  }
  const tone: AuthNoticeTone = INFO_CODES.has(code) ? "info" : "danger";
  return { code, text: COPY[code][locale] ?? COPY[code].en, tone };
}

export function authNoticeTone(message: string): AuthNoticeTone {
  return presentAuthError(message).tone;
}
