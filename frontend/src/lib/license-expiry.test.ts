import { formatLicenseExpiry, licenseExpiryHint } from "./license-expiry";

describe("license expiry", () => {
  const today = new Date(2026, 11, 1);

  it("formats the end date like the other tables", () => {
    expect(formatLicenseExpiry("2026-12-31")).toBe("31 Dec 2026");
    expect(formatLicenseExpiry(null)).toBe("—");
    expect(formatLicenseExpiry("")).toBe("—");
  });

  it("marks a date within 30 days and a date already past", () => {
    expect(licenseExpiryHint("2026-12-31", today)).toBe("soon");
    expect(licenseExpiryHint("2026-12-01", today)).toBe("soon");
    expect(licenseExpiryHint("2027-02-01", today)).toBe("ok");
    expect(licenseExpiryHint("2026-11-30", today)).toBe("expired");
    expect(licenseExpiryHint(null, today)).toBe("none");
  });
});
