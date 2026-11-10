export type InfoHintState = {
  open: boolean;
  pinned: boolean;
};

export type InfoHintEvent = "enter" | "leave" | "focus" | "blur" | "click" | "escape";

export const closedInfoHint: InfoHintState = { open: false, pinned: false };

/** Hover and focus show the note. A click pins it. Leaving, or Escape, closes it. */
export function reduceInfoHint(state: InfoHintState, event: InfoHintEvent): InfoHintState {
  if (event === "escape") {
    return closedInfoHint;
  }
  if (event === "click") {
    if (state.pinned) {
      return closedInfoHint;
    }
    return { open: true, pinned: true };
  }
  if (event === "enter" || event === "focus") {
    return { ...state, open: true };
  }
  if (state.pinned) {
    return state;
  }
  return { ...state, open: false };
}
