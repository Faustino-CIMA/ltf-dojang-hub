"""Figure fill-in (API): data so that no manual figure shows an empty state where content is expected.

- a club event today (calendar day list)
- a demo bank statement for the club (bank reconciliation)
- a credit note on LTF invoice 14 (invoice detail)
- completed transfers of Felix THILL, who ends back in his own club (LTF transfer monitor)
Run from tools/ with the manual venv:  python seed_9_figure_fill_api.py
"""
import json, urllib.request
from datetime import date, timedelta
from api import call, tok, API
A, P, C, C3 = "anne.reding", "paul.musel", 2, 3
T = date.today()

# 2. an event today
evs = call(A, "GET", f"/api/events/?club={C}")
evs = evs.get("results", evs) if isinstance(evs, dict) else evs
if not any(e.get("title") == "Open training for parents" for e in evs):
    print("event", str(call(A, "POST", "/api/events/", dict(title="Open training for parents", owner_scope="club", club=C,
          venue_name="Sports hall Mersch", visibility="public", description="Demo event.",
          starts_at=f"{T}T18:00:00", ends_at=f"{T}T19:30:00")))[:120])

# 3. bank statement (multipart upload)
st = call(A, "GET", f"/api/club-bank-statements/?club={C}")
st = st.get("results", st) if isinstance(st, dict) else st
if not st:
    d = lambda n: (T - timedelta(days=n)).strftime("%d.%m.%Y")
    csv = ("Date;Amount;Description;Counterparty;Reference\n"
           f"{d(9)};260,00;Membership {T.year};Nora HANSEN;INV-05588BB3776\n"
           f"{d(7)};130,00;Membership {T.year};Paul BECKER;\n"
           f"{d(6)};-45,90;Training cones and pads;Sport Shop Demo;\n"
           f"{d(4)};35,00;Dobok size 130;Mia HANSEN;\n"
           f"{d(2)};-80,00;LTF licences;Luxembourg Taekwondo Federation;INV-0F5FE00B403F\n").encode()
    b = "----manualdemo"
    body = (f"--{b}\r\nContent-Disposition: form-data; name=\"club\"\r\n\r\n{C}\r\n"
            f"--{b}\r\nContent-Disposition: form-data; name=\"opening_balance\"\r\n\r\n2450.00\r\n"
            f"--{b}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"demo-statement.csv\"\r\n"
            f"Content-Type: text/csv\r\n\r\n").encode() + csv + f"\r\n--{b}--\r\n".encode()
    req = urllib.request.Request(f"{API}/api/club-bank-statements/import/?club={C}", data=body, method="POST",
                                 headers={"Content-Type": f"multipart/form-data; boundary={b}", "Authorization": f"Token {tok(A)}"})
    print("bank", urllib.request.urlopen(req).status)

# 4. credit note on invoice 14
inv = call("ltf.finance", "GET", "/api/invoices/14/")
if not inv.get("credit_notes"):
    print("credit", str(call("ltf.finance", "POST", "/api/invoices/14/credit-note/",
          {"amount": "10.00", "reason": "Licence ordered twice"}))[:120])

# 5. Felix THILL (member 40): Musel -> Uelzecht -> Musel -> Uelzecht -> Musel
done = [t for t in call(A, "GET", "/api/member-transfers/") if t["member"]["id"] == 40]
if not done:
    for sender, receiver, src, dst in ((P, A, C3, C), (A, P, C, C3), (P, A, C3, C), (A, P, C, C3)):
        t = call(sender, "POST", "/api/member-transfers/", {"member_id": 40, "from_club_id": src, "to_club_id": dst, "note": "Demo move."})
        r = call(receiver, "POST", f"/api/member-transfers/{t['id']}/accept/", {})
        print("transfer", t["id"], r.get("status"))
print("SEED9 OK")
