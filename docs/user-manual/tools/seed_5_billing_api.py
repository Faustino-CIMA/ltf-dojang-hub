from datetime import date
from api import call
A = "anne.reding"; C = 2; Y = date.today().year
bp = call(A, "GET", f"/api/club-management/billing/?club={C}&year={Y}&installment=1")
rows = bp.get("households") or bp.get("rows") or []
print("keys", list(bp.keys())[:20])
ready = [r["id"] for r in rows if r.get("status") == "ready"]
print("ready", len(ready))
if ready and not any(r.get("status") in ("invoiced", "paid") for r in rows):
    r = call(A, "POST", f"/api/club-management/billing/?club={C}", {"year": Y, "installment": 1, "household_ids": ready[:12]})
    print("issued", str(r)[:300])
    inv = (r.get("created") or [])
    for c in inv[:4]:
        print("pay", str(call(A, "POST", f"/api/club-invoices/{c['invoice_id']}/record-payment/", {"payment_method": "bank_transfer", "paid_at": str(date.today()), "payment_provider": "manual"}))[:200])
# federation license order
lts = call(A, "GET", "/api/license-types/"); lts = lts.get("results", lts) if isinstance(lts, dict) else lts
lt = [t for t in lts if t.get("code") == "annual"][0]["id"]
ms = call(A, "GET", f"/api/members/?club={C}"); ms = ms.get("results", ms) if isinstance(ms, dict) else ms
need = [m["id"] for m in ms if m["is_active"] and not any(l.get("year") == Y and l.get("status") in ("active", "pending") for l in (m.get("licenses") or []))]
print("need license", len(need))
orders = call(A, "GET", f"/api/club-orders/?club={C}")
if need and not (orders.get("results") if isinstance(orders, dict) else orders):
    print("order", str(call(A, "POST", "/api/club-orders/batch/", {"club": C, "license_type": lt, "member_ids": need[:4], "year": Y}))[:300])
    print("order2", str(call("anne.reding", "POST", "/api/club-orders/batch/", {"club": C, "license_type": lt, "member_ids": need[4:6], "year": Y}))[:200])
