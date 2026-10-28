import { fireEvent, render, screen } from "@testing-library/react";

import de from "@/messages/de.json";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";
import lb from "@/messages/lb.json";
import type { TrainingVenue } from "@/lib/training-venues";

import { TrainingVenuePicker, timetablePlaceText } from "./training-venue-picker";

const labels = {
  ariaLabel: "Training venue",
  searchPlaceholder: "Search training venues",
  emptySearch: "No training venue matches",
  noneLabel: "No venue",
  legacyHint: "Saved place, not a training venue",
  inactiveLabel: "Inactive",
  emptyTitle: "No training venues yet",
  emptyBody: "Add a hall in club settings. You can still save this class without one.",
  emptyLink: "Add a training venue",
  loadError: "Training venues could not be loaded.",
  loadingLabel: "Loading training venues…",
  settingsHref: "/en/dashboard/club/settings#training-venues",
};

function venue(id: number, name: string, extra: Partial<TrainingVenue> = {}): TrainingVenue {
  return {
    id,
    club: 4,
    name,
    street: "",
    house_number: "",
    line2: "",
    postal_code: "",
    locality: "",
    country: "Luxembourg",
    notes: "",
    is_active: true,
    sort_order: id,
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
    ...extra,
  };
}

describe("timetablePlaceText", () => {
  it("keeps a legacy place exactly and follows a linked venue name", () => {
    expect(timetablePlaceText({ place: "Old hall text", venue_name: "" })).toBe("Old hall text");
    expect(timetablePlaceText({ place: "Old hall text", venue_name: "North Hall" })).toBe("North Hall");
  });
});

describe("TrainingVenuePicker", () => {
  it("links to club settings when the club has no venues and keeps a saved place", () => {
    const onChange = jest.fn();
    render(
      <TrainingVenuePicker
        venues={[]}
        venueId={null}
        place="Old hall text"
        onChange={onChange}
        {...labels}
      />,
    );

    expect(screen.getByText("Old hall text")).toBeInTheDocument();
    expect(screen.getByText("No training venues yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add a training venue" })).toHaveAttribute(
      "href",
      "/en/dashboard/club/settings#training-venues",
    );
    fireEvent.click(screen.getByRole("button", { name: "No venue" }));
    expect(onChange).toHaveBeenCalledWith({ venueId: null, place: "" });
  });

  it("marks the selected venue and searches only after more than eight", () => {
    const onChange = jest.fn();
    const { rerender } = render(
      <TrainingVenuePicker
        venues={[venue(1, "North Hall"), venue(2, "South Hall", { is_active: false })]}
        venueId={1}
        place=""
        onChange={onChange}
        {...labels}
      />,
    );

    const button = screen.getByRole("button", { name: "Training venue" });
    expect(button).toHaveTextContent("North Hall");
    expect(button.className).toContain("bg-surface");
    fireEvent.click(button);
    expect(screen.getByRole("option", { name: "North Hall" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("option", { name: /South Hall/ })).toHaveTextContent("Inactive");
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: /South Hall/ }));
    expect(onChange).toHaveBeenCalledWith({ venueId: 2, place: "South Hall" });

    rerender(
      <TrainingVenuePicker
        venues={Array.from({ length: 9 }, (_, index) => venue(index + 1, `Hall ${index + 1}`))}
        venueId={1}
        place=""
        onChange={onChange}
        {...labels}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Training venue" }));
    const search = screen.getByRole("searchbox", { name: "Search training venues" });
    fireEvent.change(search, { target: { value: "Hall 9" } });
    expect(screen.getByRole("option", { name: "Hall 9" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Hall 1" })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "No venue" })).toBeInTheDocument();
  });

  it("shows a legacy place as the current choice without turning it into a venue", () => {
    const onChange = jest.fn();
    render(
      <TrainingVenuePicker
        venues={[venue(1, "North Hall")]}
        venueId={null}
        place="Old hall text"
        onChange={onChange}
        {...labels}
      />,
    );

    expect(screen.getByRole("button", { name: "Training venue" })).toHaveTextContent("Old hall text");
    fireEvent.click(screen.getByRole("button", { name: "Training venue" }));
    const legacy = screen.getByRole("option", { name: /Old hall text/ });
    expect(legacy).toHaveAttribute("aria-selected", "true");
    expect(legacy).toHaveTextContent("Saved place, not a training venue");
    fireEvent.click(legacy);
    expect(onChange).toHaveBeenCalledWith({ venueId: null, place: "Old hall text" });
  });
});

describe("training venue labels", () => {
  const keys = [
    "trainingPlace",
    "trainingPlaceHint",
    "trainingVenueAria",
    "trainingVenueSearch",
    "trainingVenueSearchEmpty",
    "trainingVenueNone",
    "trainingVenueLegacyHint",
    "trainingVenueInactive",
    "trainingVenueEmptyTitle",
    "trainingVenueEmptyBody",
    "trainingVenueEmptyLink",
    "trainingVenueLoading",
    "trainingVenueLoadError",
  ] as const;

  it("keeps the timetable venue labels in en, fr, de and lb", () => {
    for (const messages of [en, fr, de, lb]) {
      for (const key of keys) {
        expect(messages.ClubAdmin[key].length).toBeGreaterThan(0);
      }
    }
    expect(en.ClubAdmin.trainingPlace).toBe("Training venue");
    expect(fr.ClubAdmin.trainingPlace).not.toBe(en.ClubAdmin.trainingPlace);
    expect(de.ClubAdmin.trainingPlace).not.toBe(en.ClubAdmin.trainingPlace);
    expect(lb.ClubAdmin.trainingPlace).not.toBe(en.ClubAdmin.trainingPlace);
  });
});
