import { healthCardState, healthDetailText, orderOpsHealthChecks } from "./ops-health-cards";

const KNOWN = ["postgres", "docker"];

describe("ops health cards", () => {
  it("keeps the docker card when the check has a result", () => {
    const ordered = orderOpsHealthChecks(
      {
        postgres: { ok: true, detail: "connected" },
        docker: { ok: true, detail: "2 containers", containers: [{ name: "app" }] },
      },
      KNOWN,
    );
    expect(ordered.map((row) => row.key)).toEqual(["postgres", "docker"]);
    expect(ordered[1]?.check?.detail).toBe("2 containers");
    expect(ordered[1]?.check?.ok).toBe(true);
  });

  it("keeps a docker slot when the payload omits the check", () => {
    const ordered = orderOpsHealthChecks({ postgres: { ok: true, detail: "connected" } }, KNOWN);
    expect(ordered.find((row) => row.key === "docker")).toEqual({ key: "docker", check: null });
  });

  it("appends checks that are not in the known list", () => {
    const ordered = orderOpsHealthChecks(
      { postgres: { ok: true, detail: "connected" }, queue: { ok: false, detail: "stopped" } },
      ["postgres"],
    );
    expect(ordered.map((row) => row.key)).toEqual(["postgres", "queue"]);
  });

  it("treats an unconfigured docker check as unknown and a live daemon as up", () => {
    expect(healthCardState("docker", { ok: null, detail: "not configured", configured: false })).toBe("unknown");
    expect(healthCardState("docker", { ok: false, detail: "Docker socket is not configured", configured: false })).toBe(
      "unknown",
    );
    expect(healthCardState("docker", { ok: true, detail: "2 running, 2 containers", configured: true })).toBe("up");
    expect(healthCardState("postgres", { ok: true, detail: "connected" })).toBe("ok");
    expect(healthCardState("docker", { ok: false, detail: "permission denied", configured: true })).toBe("down");
    expect(healthCardState("docker", null)).toBe("missing");
  });

  it("renders object details as text so a card cannot crash the grid", () => {
    expect(healthDetailText({ containers: 2 })).toBe('{"containers":2}');
    expect(healthDetailText("2 containers")).toBe("2 containers");
  });
});
