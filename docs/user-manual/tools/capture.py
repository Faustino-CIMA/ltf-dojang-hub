"""Capture annotated manual figures from a running local demo instance.

Usage:  python capture.py LOCALE [figure_id ...]
  LOCALE = en | lb   (the two UI languages the app ships)
Writes  ../figures/<LOCALE>/<id>.png  and  ../figures/<LOCALE>/_report.json
Requires the demo backend on :8000 and frontend on :3000 (see README).
"""
import json, sys, os, urllib.request
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw, ImageFont
sys.path.insert(0, os.path.dirname(__file__))
from figures import FIGS

API = "http://localhost:8000"; WEB = "http://localhost:3000"; PWD = "Demo-Manual-2026!"
HERE = os.path.dirname(os.path.abspath(__file__))
MSG = os.path.join(HERE, "..", "..", "repo", "frontend", "src", "messages")
DPR = 1.5
RED = (200, 16, 46)
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

def token(user, cache={}):
    if user not in cache:
        req = urllib.request.Request(API + "/api/auth/login/", data=json.dumps({"username": user, "password": PWD}).encode(),
                                     headers={"Content-Type": "application/json"})
        import time
        for attempt in range(5):
            try:
                cache[user] = json.load(urllib.request.urlopen(req))["token"]; break
            except Exception:
                if attempt == 4: raise
                time.sleep(3)
    return cache[user]

def msg(cat, key):
    d = cat
    for p in key.split("."):
        d = d[p]
    return d

def locate(page, cat, spec):
    nth = 0
    if isinstance(spec, dict):
        nth = spec.get("nth", 0); spec = spec["loc"]
    kind = spec[0]
    if kind == "css":
        loc = page.locator(spec[1])
    else:
        text = msg(cat, spec[-1])
        if kind == "tc":
            text = text.split("{")[0].strip().rstrip(":").strip()
        if kind == "t":
            loc = page.get_by_text(text, exact=True)
        elif kind == "tc":
            loc = page.get_by_text(text)
        elif kind == "aria":
            loc = page.locator(f'[aria-label="{text}"]')
        elif kind == "ph":
            loc = page.get_by_placeholder(text)
        elif kind == "role":
            loc = page.get_by_role(spec[1], name=text)
    return loc.filter(visible=True).nth(nth)

def annotate(png, boxes):
    im = Image.open(png).convert("RGB")
    ov = Image.new("RGBA", im.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)
    f = ImageFont.truetype(FONT, int(15 * DPR))
    r = int(13 * DPR)
    for n, b in boxes:
        x0, y0, x1, y1 = [v * DPR for v in b]
        pad = 4 * DPR
        d.rounded_rectangle([x0 - pad, y0 - pad, x1 + pad, y1 + pad], radius=int(6 * DPR), outline=RED + (255,), width=int(2.5 * DPR))
        cx, cy = max(r + 2, x0 - pad), max(r + 2, y0 - pad)
        cx = min(cx, im.size[0] - r - 2)
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=RED + (255,), outline=(255, 255, 255, 255), width=int(2 * DPR))
        d.text((cx, cy), str(n), font=f, fill=(255, 255, 255, 255), anchor="mm")
    Image.alpha_composite(im.convert("RGBA"), ov).convert("RGB").save(png, optimize=True)

BAD_TEXT = ["Action not allowed", "Aktioun net erlaabt", "This page could not be found", "Internal Server Error",
            "Application error", "Failed to load", "not allowed", "Server error"]
LOADING = {"en": ["Loading history", "Loading", "Loading club data", "Loading data", "Loading finance data"],
           "lb": ["Finanz-Donnéeë lueden", "Club-Donnéeë lueden", "Donnéeë ginn gelueden", "Verlaf gëtt gelueden", "Lueden"]}

def health(page, locale):
    """Wait for loading states to clear; return a list of problems visible on the page."""
    for _ in range(20):
        txt = page.locator("body").inner_text()
        lines = {l.strip() for l in txt.splitlines()}
        if not any(t in lines for t in LOADING[locale]) and not page.locator(".animate-spin").filter(visible=True).count():
            break
        page.wait_for_timeout(500)
    else:
        return ["BAD: still loading"]
    return [f"BAD: page shows '{b}'" for b in BAD_TEXT if b.lower() in txt.lower()]

def trim_bottom(png, keep=20):
    """Cut uniform background rows off the bottom of a capture (keeps a small margin)."""
    im = Image.open(png).convert("RGB")
    W, H = im.size
    px = im.load()
    ref = px[W // 2, H - 1]
    def uniform(y):
        for x in range(0, W, 4):
            p = px[x, y]
            if abs(p[0] - ref[0]) + abs(p[1] - ref[1]) + abs(p[2] - ref[2]) > 12:
                return False
        return True
    y = H - 1
    while y > H // 5 and uniform(y):
        y -= 1
    cut = min(H, y + int(keep * DPR))
    if cut < H - int(8 * DPR):
        im.crop((0, 0, W, cut)).save(png, optimize=True)

def main():
    locale = sys.argv[1]
    only = set(sys.argv[2:])
    cat = json.load(open(os.path.join(MSG, f"{locale}.json")))
    out = os.path.join(HERE, "..", "figures", locale); os.makedirs(out, exist_ok=True)
    rep_path = os.path.join(out, "_report.json")
    report = json.load(open(rep_path)) if os.path.exists(rep_path) else {}
    with sync_playwright() as p:
        b = p.chromium.launch(args=["--lang=en-GB"])
        for fig in FIGS:
            if only and fig["id"] not in only:
                continue
            w, h = fig.get("w", 1600), fig.get("h", 900)
            ctx = b.new_context(viewport={"width": w, "height": h}, device_scale_factor=DPR,
                                locale="en-GB" if locale == "en" else "lb-LU", timezone_id="Europe/Luxembourg")
            page = ctx.new_page()
            page.goto(f"{WEB}/{locale}/login")
            page.evaluate("localStorage.clear()")
            if fig["user"] != "-":
                page.evaluate(f"localStorage.setItem('ltf_token', '{token(fig['user'])}')")
            page.goto(f"{WEB}/{locale}/{fig['path']}")
            try:
                page.wait_for_load_state("networkidle", timeout=15000)
            except Exception:
                pass
            page.wait_for_timeout(1500)
            problems = []
            for st in fig.get("steps", []):
                try:
                    if st[0] == "goto":
                        page.goto(f"{WEB}/{locale}/{st[1]}"); page.wait_for_load_state("networkidle"); page.wait_for_timeout(1200)
                    elif st[0] == "click":
                        locate(page, cat, st[1]).click(timeout=5000); page.wait_for_timeout(400)
                    elif st[0] == "fill":
                        locate(page, cat, st[1]).fill(st[2]); page.wait_for_timeout(150)
                    elif st[0] == "press":
                        page.keyboard.press(st[1]); page.wait_for_timeout(300)
                    elif st[0] == "wait":
                        page.wait_for_timeout(st[1])
                except Exception as e:
                    problems.append(f"step {st}: {str(e).splitlines()[0]}")
            problems += health(page, locale)
            ox = oy = 0
            clip = None
            if fig.get("clip_main"):
                bb = page.locator("main").first.bounding_box()
                if bb:
                    ox, oy = bb["x"], 0
                    clip = {"x": bb["x"], "y": 0, "width": w - bb["x"], "height": h}
            if fig.get("crop_from"):
                try:
                    bb = locate(page, cat, fig["crop_from"]).bounding_box(timeout=3000)
                    top = max(0, bb["y"] - 28); x0 = clip["x"] if clip else 0
                    bottom = fig.get("crop_h") and min(h, top + fig["crop_h"]) or h
                    clip = {"x": x0, "y": top, "width": w - x0, "height": bottom - top}; ox, oy = x0, top
                except Exception as e:
                    problems.append(f"crop: {str(e).splitlines()[0][:80]}")
            if fig.get("crop_sel"):
                try:
                    bb = page.locator(fig["crop_sel"]).filter(visible=True).first.bounding_box(timeout=4000)
                    pad = 24
                    clip = {"x": max(0, bb["x"] - pad), "y": max(0, bb["y"] - pad), "width": bb["width"] + 2 * pad, "height": bb["height"] + 2 * pad}
                    ox, oy = clip["x"], clip["y"]
                except Exception as e:
                    problems.append(f"crop_sel: {str(e).splitlines()[0][:80]}")
            if fig.get("modal"):
                try:
                    bb = page.locator("div.fixed.inset-0 div.max-w-xl").filter(visible=True).first.bounding_box(timeout=4000)
                except Exception as e:
                    bb = None; problems.append("modal not found")
                if bb:
                    clip = {"x": bb["x"] - 16, "y": bb["y"] - 16, "width": bb["width"] + 32, "height": bb["height"] + 32}; ox, oy = clip["x"], clip["y"]
            boxes = []
            for i, a in enumerate(fig.get("ann", []), 1):
                try:
                    bb = locate(page, cat, a).bounding_box(timeout=3000)
                    if not bb:
                        raise RuntimeError("no box")
                    boxes.append((i, (bb["x"] - ox, bb["y"] - oy, bb["x"] + bb["width"] - ox, bb["y"] + bb["height"] - oy)))
                except Exception as e:
                    problems.append(f"ann {i} {a}: {str(e).splitlines()[0][:80]}")
            path = os.path.join(out, fig["id"] + ".png")
            page.screenshot(path=path, clip=clip)
            if boxes:
                annotate(path, boxes)
            if fig.get("trim", True):
                trim_bottom(path)
            report[fig["id"]] = {"found": [n for n, _ in boxes], "problems": problems}
            print(fig["id"], "OK" if not problems else problems, flush=True)
            ctx.close()
        b.close()
    json.dump(report, open(rep_path, "w"), indent=1)

if __name__ == "__main__":
    main()
