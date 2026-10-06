"""Check that every UI key used by figures.py exists in the app's en.json. Prints offenders; silent = OK."""
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from figures import FIGS
en = json.load(open(os.path.join(HERE, "..", "..", "repo", "frontend", "src", "messages", "en.json"), encoding="utf-8"))
def get(k):
    d=en
    for p in k.split('.'):
        if not isinstance(d,dict) or p not in d: return None
        d=d[p]
    return d
def locs(f):
    for a in f.get('ann',[]):
        yield a['loc'] if isinstance(a,dict) else a
    for s in f.get('steps',[]):
        if s[0] in('click','hover'):
            l=s[1]; yield l['loc'] if isinstance(l,dict) else l
for f in FIGS:
    for l in locs(f):
        if l[0]!='css' and get(l[-1]) is None: print(f['id'], l)
