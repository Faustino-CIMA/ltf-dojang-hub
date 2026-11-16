import { requestServerCutout } from "./server-removal";

jest.mock("./auth", () => ({ getToken: () => "token-1" }));
jest.mock("./active-desk", () => ({ readActiveDeskHeader: () => "member" }));

describe("server cutout request", () => {
  const original = global.fetch;

  afterEach(() => {
    global.fetch = original;
  });

  it("sends the photo to the signed-in cutout address and returns the mask", async () => {
    const png = new Blob([Uint8Array.from([137, 80, 78, 71])], { type: "image/png" });
    global.fetch = jest.fn(async () => ({
      ok: true,
      blob: async () => png,
    })) as unknown as typeof fetch;
    const result = await requestServerCutout(new Blob(["face"]));
    expect(result.size).toBeGreaterThan(0);
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(String(url)).toContain("/api/photos/cutout/");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Token token-1");
    expect(init.body).toBeInstanceOf(FormData);
  });

  it("fails when the server does not answer, so the phone model can take over", async () => {
    global.fetch = jest.fn(async () => ({ ok: false, blob: async () => new Blob() })) as unknown as typeof fetch;
    await expect(requestServerCutout(new Blob(["face"]))).rejects.toThrow(/server cutout/);
  });
});
