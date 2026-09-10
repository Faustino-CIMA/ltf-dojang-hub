"""Stable module ids. Later branches ship the product; step 0 only ships preview."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

Scope = Literal["install", "club"]


@dataclass(frozen=True, slots=True)
class ModuleSpec:
    id: str
    label: str
    scope: Scope
    description: str
    shipped: bool = False


PREVIEW_MODULE_ID = "preview"

MODULE_SPECS: tuple[ModuleSpec, ...] = (
    ModuleSpec(
        id=PREVIEW_MODULE_ID,
        label="Preview module",
        scope="club",
        description="Coming-soon prove-out for entitlements and per-club assignment. Not a sold product.",
        shipped=True,
    ),
    ModuleSpec(
        id="club_management",
        label="Club management",
        scope="club",
        description="Club membership and dues (club to member). Not shipped yet.",
    ),
    ModuleSpec(
        id="event_calendar",
        label="Event calendar",
        scope="club",
        description="Federation calendar when entitled; club calendar when assigned. Not shipped yet.",
    ),
    ModuleSpec(
        id="inventory_federation",
        label="Federation inventory",
        scope="install",
        description="Federation sells goods to clubs. Not shipped yet.",
    ),
    ModuleSpec(
        id="inventory_club",
        label="Club inventory",
        scope="club",
        description="Club sells goods to members. Not shipped yet.",
    ),
    ModuleSpec(
        id="tournament_kyorugi",
        label="Kyorugi tournament",
        scope="club",
        description="WT kyorugi pack. Host clubs only. Not shipped yet.",
    ),
    ModuleSpec(
        id="tournament_poomsae",
        label="Poomsae tournament",
        scope="club",
        description="WT poomsae pack. Host clubs only. Not shipped yet.",
    ),
)

MODULE_BY_ID = {spec.id: spec for spec in MODULE_SPECS}
KNOWN_MODULE_IDS = frozenset(MODULE_BY_ID)


def get_spec(module_id: str) -> ModuleSpec | None:
    return MODULE_BY_ID.get(module_id)


def catalog() -> list[dict]:
    return [
        {
            "id": spec.id,
            "label": spec.label,
            "scope": spec.scope,
            "description": spec.description,
            "shipped": spec.shipped,
        }
        for spec in MODULE_SPECS
    ]
