"""Ad-hoc screenshot helper.  Usage: python shot.py USER LOCALE PATH OUT.png [wait_ms] [full]"""
import json, sys, urllib.request
from playwright.sync_api import sync_playwright

API = "http://localhost:8000"; WEB = "http://localhost:3000"; PWD = "Demo-Manual-2026!"

def token(user):
    req = urllib.request.Request(API + "/api/auth/login/", data=json.dumps({"username": user, "password": PWD}).encode(),
                                 headers={"Content-Type": "application/json"})
    return json.load(urllib.request.urlopen(req))["token"]

def run(user, locale, path, out, wait=2500, full=False, w=1440, h=900):
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": w, "height": h}, device_scale_factor=2, locale="en-GB")
        page = ctx.new_page()
        page.goto(WEB + f"/{locale}/login")
        if user != "-":
            t = token(user)
            page.evaluate(f"localStorage.setItem('ltf_token', '{t}')")
        page.goto(WEB + f"/{locale}/{path}")
        page.wait_for_timeout(wait)
        page.screenshot(path=out, full_page=full)
        b.close()

if __name__ == "__main__":
    a = sys.argv[1:]
    run(a[0], a[1], a[2], a[3], int(a[4]) if len(a) > 4 else 2500, len(a) > 5)
