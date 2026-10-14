const NON_SLUG = /[^a-z0-9]+/g;
const LTF_SCOPE = "LTF";
const PRINT_TIME_ZONE = "Europe/Luxembourg";

export function printScopeSlug(clubName: string | null | undefined): string {
  const normalized = (clubName ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  const slug = normalized.toLowerCase().replace(NON_SLUG, "-").replace(/^-+|-+$/g, "");
  return slug || LTF_SCOPE;
}

export function printJobPdfDate(createdAt: string | null | undefined): string {
  if (!createdAt) {
    return "unknown";
  }
  const parsed = new Date(createdAt);
  if (Number.isNaN(parsed.getTime())) {
    const prefix = createdAt.slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(prefix) ? prefix : "unknown";
  }
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: PRINT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(parsed);
}

export function printJobPdfFilename(input: {
  clubName: string | null | undefined;
  jobId: number;
  createdAt: string | null | undefined;
}): string {
  const scope = printScopeSlug(input.clubName);
  const datePart = printJobPdfDate(input.createdAt);
  return `license-cards_${scope}_${input.jobId}_${datePart}.pdf`;
}

export function filenameFromContentDisposition(header: string | null): string | null {
  if (!header) {
    return null;
  }
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (encoded?.[1]) {
    try {
      return decodeURIComponent(encoded[1].trim().replace(/["']/g, ""));
    } catch {
      return encoded[1].trim();
    }
  }
  const quoted = /filename="([^"]+)"/i.exec(header);
  if (quoted?.[1]) {
    return quoted[1];
  }
  const plain = /filename=([^;]+)/i.exec(header);
  return plain?.[1]?.trim().replace(/^["']|["']$/g, "") || null;
}

export function openPdfPreview(blob: Blob) {
  const url = window.URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
  window.setTimeout(() => {
    window.URL.revokeObjectURL(url);
  }, 15000);
}

export function downloadPdfFile(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => {
    window.URL.revokeObjectURL(url);
  }, 0);
}
