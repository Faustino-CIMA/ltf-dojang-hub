#!/usr/bin/env python3
"""Build the LTF Dojang Hub user manual (single source, four languages).

    python build.py            # build all languages
    python build.py en lb      # build selected languages
    python build.py --check    # only run the consistency checks

Sources
  content/<lang>.md        one Markdown file per manual language (YAML front matter)
  content/glossary.yaml    shared glossary (UI keys + per-language explanations)
  template/manual.html     Jinja2 page template (cover, TOC, body, glossary, index)
  template/manual.css      print stylesheet (A4, header/footer, page numbers)
  figures/<ui>/<id>.png    screenshots captured by tools/capture.py (ui = en | lb)
  ../repo/frontend/src/messages/<ui>.json   the app's own UI strings

Markup on top of Markdown
  [[key]] / [[Namespace.key]]   exact on-screen label, taken from the app catalogue
  [[key|year=2026]]             same, with ICU placeholders filled in
  ![Caption](fig:id)            numbered figure from figures/<ui>/id.png
  > [!TIP] / [!WARNING] / [!NOTE]   call-out boxes
  {{Term}}                      index entry (shown as normal text)
  {{Term|shown text}}           index entry with different visible text
  ## Heading {#anchor}          stable anchors, identical in all languages
"""
import html, json, os, re, sys, datetime
import yaml, markdown
from jinja2 import Environment, FileSystemLoader

HERE = os.path.dirname(os.path.abspath(__file__))
MSG_DIR = os.environ.get("LTF_MESSAGES", os.path.join(HERE, "..", "repo", "frontend", "src", "messages"))
LANGS = ["en", "de", "fr", "lb"]
NS_ORDER = ["ClubAdmin", "ClubMgmt", "Events", "Member", "LtfAdmin", "LtfFinance", "Import", "Common",
            "Auth", "Reset", "Verify", "Ops", "Dashboard", "Checkout", "About", "Home"]

_catalogues = {}
MISSING = set()

TBL_ATTR = re.compile(r"\s*<tr>\s*<td>\{: \.([\w-]+)\}</td>(?:\s*<td></td>)*\s*</tr>(\s*</tbody>\s*</table>)")


def table_classes(html):
    """Python-Markdown tables ignore a trailing '{: .cls}' line and render it as a last row.
    Drop that row and put the class on the table instead."""
    while True:
        m = TBL_ATTR.search(html)
        if not m:
            return html
        start = html.rfind("<table", 0, m.start())
        head = html[start:start + 6] + f' class="{m.group(1)}"'
        html = html[:start] + head + html[start + 6:m.start()] + m.group(2) + html[m.end():]


def catalogue(ui):
    if ui not in _catalogues:
        _catalogues[ui] = json.load(open(os.path.join(MSG_DIR, f"{ui}.json"), encoding="utf-8"))
    return _catalogues[ui]

def ui_label(ui, ref):
    """Resolve 'key' or 'Ns.key' to the catalogue string."""
    cat = catalogue(ui)
    if "." in ref and ref.split(".")[0] in cat:
        ns, key = ref.split(".", 1)
        val = cat[ns].get(key)
    else:
        val = next((cat[ns][ref] for ns in NS_ORDER if ns in cat and ref in cat[ns]), None)
    if not isinstance(val, str):
        MISSING.add(ref)
        return f"??{ref}??"
    return val

def fill(text, args):
    for k, v in args.items():
        text = text.replace("{" + k + "}", v)
    return text

class Ctx:
    def __init__(self, lang, meta):
        self.lang, self.meta, self.ui = lang, meta, meta["ui"]
        self.figs, self.index, self.keys = [], [], []

def preprocess(src, ctx):
    labels = ctx.meta["labels"]

    def ui_sub(m):
        ref, _, rest = m.group(1).partition("|")
        args = dict(p.split("=", 1) for p in rest.split(";") if "=" in p) if rest else {}
        ctx.keys.append(ref)
        txt = fill(ui_label(ctx.ui, ref.strip()), args)
        return f'<span class="ui">{html.escape(txt)}</span>'

    def idx_sub(m):
        term, _, shown = m.group(1).partition("|")
        n = len(ctx.index) + 1
        ctx.index.append((term.strip(), f"ix{n}"))
        return f'<span class="ix" id="ix{n}"></span>{shown or term}'

    def fig_sub(m):
        cap, fid = m.group(1), m.group(2)
        path = os.path.join(HERE, "figures", ctx.ui, fid + ".png")
        if not os.path.exists(path):
            raise FileNotFoundError(path)
        ctx.figs.append(fid)
        n = len(ctx.figs)
        cls = "fig"
        size = ""
        mm = re.match(r"(.*?)\s*\{(\w+)\}\s*$", cap)
        if mm:
            cap, cls = mm.group(1), "fig " + mm.group(2)
        return (f'\n<figure class="{cls}" id="fig-{fid}"><img src="file://{path}" alt="">'
                f'<figcaption><b>{labels["figure"]} {n}</b> · {cap}</figcaption></figure>\n')

    def callout(m):
        kind = m.group(1).lower()
        body = re.sub(r"^> ?", "", m.group(2), flags=re.M)
        inner = markdown.markdown(body, extensions=["extra"])
        return (f'\n<div class="callout {kind}" markdown="0"><div class="callout-title">{labels[kind]}</div>'
                f'{inner}</div>\n')

    src = re.sub(r"\[\[([^\]]+)\]\]", ui_sub, src)
    src = re.sub(r"\{\{([^}]+)\}\}", idx_sub, src)
    src = re.sub(r"!\[([^\]]*)\]\(fig:([\w-]+)\)", fig_sub, src)
    src = re.sub(r"^> \[!(TIP|WARNING|NOTE)\][ \t]*\n((?:>.*\n?)+)", callout, src, flags=re.M)
    return src

def split_front(text):
    m = re.match(r"^---\n(.*?)\n---\n(.*)$", text, re.S)
    return yaml.safe_load(m.group(1)), m.group(2)

def headings(body_html):
    out = []
    for m in re.finditer(r'<h([12]) id="([^"]+)"[^>]*>(.*?)</h\1>', body_html, re.S):
        out.append((int(m.group(1)), m.group(2), re.sub("<[^>]+>", "", m.group(3))))
    return out

def auto_index(body_html, terms, ctx):
    """Mark the first occurrence of each index term in every h2 section.

    terms: list of "Index entry" or "Index entry = regex" strings from the front matter.
    """
    parts = re.split(r'(?=<h[12] )', body_html)
    out = []
    for part in parts:
        for t in terms:
            entry, _, pat = t.partition("=")
            entry = entry.strip(); pat = pat.strip() or re.escape(entry)
            rx = re.compile(r"(?<![\w-])(" + pat + r")(?![\w-])", re.I)
            # search only in text between tags, skip figures/captions
            pos = 0
            for seg in re.finditer(r">([^<]+)<", part):
                m = rx.search(seg.group(1))
                if m and not part[:seg.start()].endswith("<figcaption"):
                    n = len(ctx.index) + 1
                    ctx.index.append((entry, f"ix{n}"))
                    at = seg.start(1) + m.start()
                    part = part[:at] + f'<span class="ix" id="ix{n}"></span>' + part[at:]
                    break
        out.append(part)
    return "".join(out)

def build(lang, check_only=False):
    meta, body = split_front(open(os.path.join(HERE, "content", f"{lang}.md"), encoding="utf-8").read())
    ctx = Ctx(lang, meta)
    pre = preprocess(body, ctx)
    md = markdown.Markdown(extensions=["extra", "attr_list", "sane_lists", "toc"],
                           extension_configs={"toc": {"permalink": False}})
    body_html = md.convert(pre)
    body_html = table_classes(body_html)
    body_html = auto_index(body_html, meta.get("index_terms", []), ctx)
    toc = headings(body_html)
    # index: group by term, sorted with locale-friendly key
    groups = {}
    for term, anchor in ctx.index:
        groups.setdefault(term, []).append(anchor)   # capped after layout (pass 2)
    def sortkey(t):
        import unicodedata
        return unicodedata.normalize("NFD", t.lower()).encode("ascii", "ignore").decode()
    index = sorted(groups.items(), key=lambda kv: sortkey(kv[0]))
    letters = []
    for term, anchors in index:
        L = sortkey(term)[:1].upper()
        if not letters or letters[-1][0] != L:
            letters.append((L, []))
        letters[-1][1].append((term, anchors))
    gl = yaml.safe_load(open(os.path.join(HERE, "content", "glossary.yaml"), encoding="utf-8"))
    glossary = []
    for g in gl:
        glossary.append({
            "term": g[lang]["term"], "text": markdown.markdown(g[lang]["text"]).removeprefix("<p>").removesuffix("</p>"),
            "en": ui_label("en", g["key"]) if g.get("key") else "—",
            "lb": ui_label("lb", g["key"]) if g.get("key") else "—",
        })
    glossary.sort(key=lambda g: sortkey(g["term"]))
    report = {"figs": ctx.figs, "keys": ctx.keys, "toc": [(l, a) for l, a, _ in toc], "index": len(ctx.index)}
    if check_only:
        return report
    env = Environment(loader=FileSystemLoader(os.path.join(HERE, "template")), autoescape=False)
    from weasyprint import HTML
    html_path = os.path.join(HERE, "build", f"manual-{lang}.html")
    os.makedirs(os.path.dirname(html_path), exist_ok=True)
    def render(letters):
        page = env.get_template("manual.html").render(
            meta=meta, lang=lang, body=body_html, toc=toc, letters=letters, glossary=glossary,
            here=HERE, built=datetime.date.today().isoformat())
        open(html_path, "w", encoding="utf-8").write(page)
        return HTML(html_path, base_url=HERE).render()
    # pass 1: lay out with every index mark, find the page of each mark
    doc = render(letters)
    page_of = {a: i for i, pg in enumerate(doc.pages) for a in pg.anchors}
    # pass 2: one reference per page per term, at most index_max_refs references
    cap = int(meta.get("index_max_refs", 6))
    letters2 = []
    for L, items in letters:
        out = []
        for term, anchors in items:
            seen, keep = set(), []
            for a in anchors:
                pg = page_of.get(a)
                if pg is None or pg in seen:
                    continue
                seen.add(pg); keep.append(a)
            out.append((term, keep[:cap]))
        letters2.append((L, out))
    pdf = os.path.join(HERE, meta["pdf_name"])
    render(letters2).write_pdf(pdf)
    print(f"{lang}: {pdf}  ({len(ctx.figs)} figures, {len(toc)} headings, {len(ctx.index)} index marks)")
    return report

def compare(reports):
    """All languages must share the same structure: headings/anchors, figures, UI keys."""
    ok = True
    base = reports["en"]
    for lang, r in reports.items():
        for field in ("toc", "figs", "keys"):
            if r[field] != base[field]:
                ok = False
                a, b = base[field], r[field]
                i = next((i for i in range(min(len(a), len(b))) if a[i] != b[i]), min(len(a), len(b)))
                print(f"[sync] {lang}: {field} differs from en at item {i}: en={a[i:i+2]} {lang}={b[i:i+2]} (len {len(a)} vs {len(b)})")
    print("[sync] all languages in sync" if ok else "[sync] languages are NOT in sync")
    return ok

if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    check = "--check" in sys.argv
    langs = args or LANGS
    reports = {l: build(l, check_only=check) for l in langs}
    if MISSING:
        print("[keys] unknown UI keys:", ", ".join(sorted(MISSING)))
        sys.exit(2)
    if "en" in reports and len(reports) > 1:
        sys.exit(0 if compare(reports) else 1)
