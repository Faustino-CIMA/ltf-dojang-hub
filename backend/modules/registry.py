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
EVENT_CALENDAR_MODULE_ID = "event_calendar"
CLUB_MANAGEMENT_MODULE_ID = "club_management"
INVENTORY_FEDERATION_MODULE_ID = "inventory_federation"
# Historical product id. Club shop ships inside club_management; never mint this.
INVENTORY_CLUB_LEGACY_ID = "inventory_club"
LEGACY_MODULE_ALIASES = {INVENTORY_CLUB_LEGACY_ID: CLUB_MANAGEMENT_MODULE_ID}

MODULE_SPECS: tuple[ModuleSpec, ...] = (
    ModuleSpec(
        id=PREVIEW_MODULE_ID,
        label="Preview module",
        scope="club",
        description="Coming-soon prove-out for entitlements and per-club assignment. Not a sold product.",
        shipped=True,
    ),
    ModuleSpec(
        id=CLUB_MANAGEMENT_MODULE_ID,
        label="Club management",
        scope="club",
        description="Club membership records, families, dues, committees, the in-club shop, and training.",
        shipped=True,
    ),
    ModuleSpec(
        id=EVENT_CALENDAR_MODULE_ID,
        label="Event calendar",
        scope="club",
        description="Federation calendar when entitled; club calendar when assigned.",
        shipped=True,
    ),
    ModuleSpec(
        id=INVENTORY_FEDERATION_MODULE_ID,
        label="Federation inventory",
        scope="install",
        description="Federation sells goods to clubs. Not shipped yet.",
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


def canonical_module_id(module_id: str) -> str:
    return LEGACY_MODULE_ALIASES.get(module_id, module_id)


def canonical_module_ids(module_ids: list[str]) -> list[str]:
    return [canonical_module_id(mid) for mid in module_ids]


def get_spec(module_id: str) -> ModuleSpec | None:
    return MODULE_BY_ID.get(canonical_module_id(module_id))


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
