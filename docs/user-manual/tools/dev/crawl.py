"""Capture a screenshot of each route for a role.  python crawl.py LOCALE OUTDIR [filter]"""
import sys, json, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright
import os, sys; sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from api import tok
WEB = "http://localhost:3000"
ROUTES = {
 "anne.reding": ["dashboard/club", "dashboard/club/members", "dashboard/club/members/60", "dashboard/club/members/new",
   "dashboard/club/members/import", "dashboard/club/members/order-licenses", "dashboard/club/licenses",
   "dashboard/club/print-jobs", "dashboard/club/print-jobs/quick-print", "dashboard/club/printer-profiles",
   "dashboard/club/transfers", "dashboard/club/invoices", "dashboard/club/orders", "dashboard/club/payments",
   "dashboard/club/billing", "dashboard/club/fees", "dashboard/club/income", "dashboard/club/expenses",
   "dashboard/club/bank", "dashboard/club/reports", "dashboard/club/subsidies", "dashboard/club/families",
   "dashboard/club/training", "dashboard/club/training/month", "dashboard/club/training/year",
   "dashboard/club/training/timetable", "dashboard/club/training/holidays", "dashboard/club/training/hours",
   "dashboard/club/training/sessions/4", "dashboard/club/promotion", "dashboard/club/shop",
   "dashboard/club/shop/items", "dashboard/club/shop/sell", "dashboard/club/shop/sales", "dashboard/club/shop/snapshots",
   "dashboard/club/calendar", "dashboard/club/calendar/new", "dashboard/club/calendar/3", "dashboard/club/admins",
   "dashboard/club/settings", "dashboard/club/committee", "dashboard/club/members/60/photo"],
 "jeff.lorang": ["dashboard/club", "dashboard/club/training", "dashboard/club/training/sessions/4", "dashboard/club/training/hours", "dashboard/club/members"],
 "sandra.weis": ["dashboard/member", "dashboard/member/calendar", "dashboard/member/photo", "settings/privacy"],
 "ltf.admin": ["dashboard/ltf", "dashboard/ltf/clubs", "dashboard/ltf/clubs/2", "dashboard/ltf/clubs/new", "dashboard/ltf/club-admins",
   "dashboard/ltf/member-transfers", "dashboard/ltf/members", "dashboard/ltf/members/60", "dashboard/ltf/licenses",
   "dashboard/ltf/license-cards", "dashboard/ltf/license-cards/print-jobs", "dashboard/ltf/license-types",
   "dashboard/ltf/printer-profiles", "dashboard/ltf/settings", "dashboard/ltf/committee", "dashboard/ltf/calendar",
   "dashboard/ltf/calendar/new", "dashboard/ltf/import", "dashboard/ltf/preview"],
 "ltf.finance": ["dashboard/ltf-finance", "dashboard/ltf-finance/orders", "dashboard/ltf-finance/invoices",
   "dashboard/ltf-finance/payments", "dashboard/ltf-finance/income", "dashboard/ltf-finance/income/new",
   "dashboard/ltf-finance/expenses", "dashboard/ltf-finance/expenses/new", "dashboard/ltf-finance/bank",
   "dashboard/ltf-finance/reports", "dashboard/ltf-finance/audit-log", "dashboard/ltf-finance/license-settings",
   "dashboard/ltf-finance/license-settings/new"],
 "ops.demo": ["dashboard/ops", "dashboard/ops/modules", "dashboard/ops/users", "dashboard/ops/translations"],
 "-": ["", "login", "register", "about", "reset-password"],
}
def main():
    loc, out = sys.argv[1], Path(sys.argv[2]); flt = sys.argv[3] if len(sys.argv) > 3 else ""
    out.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        b = p.chromium.launch()
        for user, routes in ROUTES.items():
            if flt and flt != user: continue
            ctx = b.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=1)
            page = ctx.new_page(); page.goto(f"{WEB}/{loc}/login")
            if user != "-": page.evaluate(f"localStorage.setItem('ltf_token', '{tok(user)}')")
            for r in routes:
                name = (user.split('.')[0] + "__" + (r.replace("dashboard/", "").replace("/", "_") or "home"))
                try:
                    page.goto(f"{WEB}/{loc}/{r}", wait_until="networkidle", timeout=30000)
                except Exception as e:
                    print("timeout", r)
                page.wait_for_timeout(1200)
                page.screenshot(path=str(out / f"{name}.png"), full_page=True)
                print("ok", name, page.url.replace(WEB, ""))
            ctx.close()
        b.close()
main()
