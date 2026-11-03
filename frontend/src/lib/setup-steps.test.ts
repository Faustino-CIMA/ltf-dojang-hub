import { setupStepIndex } from "./setup-steps";

describe("setup stepper resume", () => {
  it("opens on welcome until setup has started", () => {
    expect(setupStepIndex({ started: false, completed: false, current_step: "clubs" })).toBe(0);
  });

  it("resumes the saved step", () => {
    expect(setupStepIndex({ started: true, completed: false, current_step: "members" })).toBe(2);
    expect(setupStepIndex({ started: true, completed: false, current_step: "admins" })).toBe(3);
    expect(setupStepIndex({ started: true, completed: true, current_step: "done" })).toBe(4);
  });
});
