import { healthDetailText, orderOpsHealthChecks } from "./ops-health-cards";

const KNOWN = ["postgres", "redis"];

describe("ops health cards", () => {
  it("keeps known cards in order when each check has a result", () => {
    const ordered = orderOpsHealthChecks(
      {
        redis: { ok: true, detail: "reachable" },
        postgres: { ok: true, detail: "connected" },
      },
      KNOWN,
    );
    expect(ordered.map((row) => row.key)).toEqual(["postgres", "redis"]);
    expect(ordered[0]?.check?.detail).toBe("connected");
    expect(ordered[1]?.check?.ok).toBe(true);
  });

  it("keeps a known slot when the payload omits the check", () => {
    const ordered = orderOpsHealthChecks({ postgres: { ok: true, detail: "connected" } }, KNOWN);
    expect(ordered.find((row) => row.key === "redis")).toEqual({ key: "redis", check: null });
  });

  it("appends checks that are not in the known list", () => {
    const ordered = orderOpsHealthChecks(
      { postgres: { ok: true, detail: "connected" }, queue: { ok: false, detail: "stopped" } },
      ["postgres"],
    );
    expect(ordered.map((row) => row.key)).toEqual(["postgres", "queue"]);
  });

  it("renders object details as text so a card cannot crash the grid", () => {
    expect(healthDetailText({ containers: 2 })).toBe('{"containers":2}');
    expect(healthDetailText("2 containers")).toBe("2 containers");
  });
});
