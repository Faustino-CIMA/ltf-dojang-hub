"""Print UI strings (EN | LB) used by a source file. python keys.py FILE [FILE...]"""
import json, re, sys
from pathlib import Path
M = Path("/workspace/ltf-manual/repo/frontend/src/messages")
EN = json.load(open(M / "en.json")); LB = json.load(open(M / "lb.json"))
def get(d, ns, key):
    cur = d.get(ns, {})
    for part in key.split("."):
        if not isinstance(cur, dict): return None
        cur = cur.get(part)
    return cur
for f in sys.argv[1:]:
    src = Path(f).read_text()
    vars_ = dict(re.findall(r'const (\w+) = useTranslations\("(\w+)"\)', src))
    seen = set()
    for var, key in re.findall(r'\b(\w+)\(\s*"([\w.]+)"', src):
        if var not in vars_ or (var, key) in seen: continue
        seen.add((var, key)); ns = vars_[var]
        e = get(EN, ns, key)
        if isinstance(e, str):
            print(f"{key}: {e} | {get(LB, ns, key)}")
