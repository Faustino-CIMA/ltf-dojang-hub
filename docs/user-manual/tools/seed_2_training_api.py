"""Second seed stage through the public API (runs the app's own business rules)."""
from datetime import date, timedelta
from api import call
A = "anne.reding"; C = 2; Y = date.today().year
me_coach = call("jeff.lorang", "GET", "/api/auth/me/")["id"]
members = call(A, "GET", f"/api/members/?club={C}")
members = members.get("results", members) if isinstance(members, dict) else members
print("members", len(members))
kids = [m["id"] for m in members if m.get("date_of_birth") and int(m["date_of_birth"][:4]) > Y - 14][:12]
adults = [m["id"] for m in members if m.get("date_of_birth") and int(m["date_of_birth"][:4]) < Y - 17][:10]
series = [
    dict(name="Kids beginners", audience="kids", weekday=1, start_time="17:30", end_time="18:30"),
    dict(name="Kids advanced", audience="kids", weekday=3, start_time="17:30", end_time="18:45"),
    dict(name="Adults", audience="adults", weekday=1, start_time="19:00", end_time="20:30"),
    dict(name="Competition team", audience="competition", weekday=4, start_time="18:30", end_time="20:00"),
    dict(name="Adults", audience="adults", weekday=3, start_time="19:00", end_time="20:30"),
]
if call(A, "GET", "/api/club-management/training/series/", club=C) == []:
    for s in series:
        s.update(valid_from=f"{Y}-09-01", valid_until=f"{Y+1}-07-15", skip_public_holidays=True,
                 skip_school_holidays=True, place="Sports hall Mersch", coach_ids=[me_coach],
                 regular_ids=kids if s["audience"] == "kids" else adults, active=True, generate=True,
                 counts_for_under_16=s["audience"] != "adults")
        r = call(A, "POST", "/api/club-management/training/series/", s, club=C); print("series", str(r)[:200])
# fees
if call(A, "GET", f"/api/club-management/membership-fees/?club={C}") == []:
    for n, a in (("Children (under 16)", "90.00"), ("Adults", "120.00"), ("Students", "100.00")):
        print("fee", str(call(A, "POST", "/api/club-management/membership-fees/", {"club": C, "name": n, "amount": a}))[:200])
    print("licfee", str(call(A, "PUT", "/api/club-management/license-fee/", {"name": "License fee", "amount": "40.00"}, club=C))[:200])
# events
evs = [
    dict(title="Belt test (Kup grades)", owner_scope="club", club=C, venue_name="Sports hall Mersch", visibility="public", d=12, h=10),
    dict(title="Committee meeting", owner_scope="club", club=C, venue_name="Club room", visibility="private", d=16, h=19),
    dict(title="Coaches' planning evening", owner_scope="club", club=C, venue_name="Club room", visibility="internal", d=21, h=19),
    dict(title="Club Christmas party", owner_scope="club", club=C, venue_name="Sports hall Mersch", visibility="shared", d=55, h=15),
]
if not [e for e in call(A, "GET", f"/api/events/?club={C}") if isinstance(e, dict)]:
    for e in evs:
        d = date.today() + timedelta(days=e.pop("d")); h = e.pop("h")
        e.update(starts_at=f"{d}T{h:02d}:00:00", ends_at=f"{d}T{h+2:02d}:00:00", description="Demo event.")
        print("ev", str(call(A, "POST", "/api/events/", e))[:200])
    for t, d, vis, extra in (("LTF national championship", 26, "public", {}), ("Referee seminar", 34, "public", {}),
                             ("Club presidents meeting", 40, "presidents", {"audience_clubs": [2, 3]})):
        dd = date.today() + timedelta(days=d)
        p = dict(title=t, owner_scope="federation", venue_name="Coque, Luxembourg", visibility=vis,
                 starts_at=f"{dd}T09:00:00", ends_at=f"{dd}T17:00:00", description="Demo federation date.", **extra)
        print("fev", str(call("ltf.admin", "POST", "/api/events/", p))[:200])
