from datetime import date, timedelta
from collections import defaultdict
from api import call
A = "anne.reding"; C = 2; Y = date.today().year
ms = call(A, "GET", f"/api/members/?club={C}")
ms = ms.get("results", ms) if isinstance(ms, dict) else ms
by_last = defaultdict(list)
for m in ms:
    if m["is_active"]: by_last[m["last_name"]].append(m)
fams = call(A, "GET", f"/api/club-management/families/?club={C}")
if fams == []:
    n = 0
    for last, group in by_last.items():
        if len(group) >= 2 and n < 6:
            f = call(A, "POST", "/api/club-management/families/", {"club": C, "name": f"Family {last.title()}"})
            print("fam", str(f)[:160])
            if "id" in f:
                for m in group[:3]:
                    print("  add", str(call(A, "POST", f"/api/club-management/families/{f['id']}/add-member/", {"member": m["id"]}))[:120])
            n += 1
# attendance on past sessions
sess = call(A, "GET", f"/api/club-management/training/sessions/?club={C}&from={Y}-09-01&to={date.today()}")
print("past sessions", len(sess) if isinstance(sess, list) else sess)
coach = call("jeff.lorang", "GET", "/api/auth/me/")["id"]
if isinstance(sess, list):
    for s in sess:
        if not s["present_ids"] and s["status"] != "cancelled":
            roll = call(A, "GET", f"/api/club-management/training/sessions/{s['id']}/?club={C}")
            ids = roll.get("suggested_ids", [])[:]
            ids = ids[: max(3, len(ids) - (s["id"] % 3))]
            call(A, "PUT", f"/api/club-management/training/sessions/{s['id']}/attendance/?club={C}", {"member_ids": ids, "coach_ids": [coach]})
# promotion rules
if call(A, "GET", f"/api/club-management/training/promotion/rules/?club={C}") == []:
    for g, h in (("9th Kup", 20), ("8th Kup", 24), ("7th Kup", 28), ("6th Kup", 32), ("5th Kup", 36), ("4th Kup", 40)):
        print("rule", str(call(A, "POST", f"/api/club-management/training/promotion/rules/?club={C}", {"to_grade": g, "required_hours": str(h)}))[:120])
print("DONE")
# promotion rules + belt test (stage 2b)
rules = call(A, "GET", f"/api/club-management/training/promotion/rules/?club={C}")
if isinstance(rules, dict) and not rules.get("rules"):
    for g, h in (("9th Kup", 10), ("8th Kup", 12), ("7th Kup", 14), ("6th Kup", 16), ("5th Kup", 18), ("4th Kup", 20), ("3rd Kup", 24)):
        print("rule", str(call(A, "POST", f"/api/club-management/training/promotion/rules/?club={C}", {"to_grade": g, "required_hours": str(h), "audience": ""}))[:140])
if call(A, "GET", f"/api/club-management/training/promotion/tests/?club={C}") in ([], {"results": []}):
    print("test", str(call(A, "POST", f"/api/club-management/training/promotion/tests/?club={C}", {"name": "Autumn belt test", "held_on": str(date.today() + timedelta(days=6))}))[:200])
