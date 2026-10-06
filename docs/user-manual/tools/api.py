import json, urllib.request, urllib.error
API = "http://localhost:8000"; PWD = "Demo-Manual-2026!"
_tok = {}
def tok(user):
    if user not in _tok:
        _tok[user] = call(None, "POST", "/api/auth/login/", {"username": user, "password": PWD})["token"]
    return _tok[user]
def call(user, method, path, body=None, club=None):
    h = {"Content-Type": "application/json"}
    if user: h["Authorization"] = "Token " + tok(user)
    if club: path += ("&" if "?" in path else "?") + f"club={club}"
    req = urllib.request.Request(API + path, method=method, headers=h, data=json.dumps(body).encode() if body is not None else None)
    try:
        r = urllib.request.urlopen(req); t = r.read()
        return json.loads(t) if t else {}
    except urllib.error.HTTPError as e:
        return {"__error": e.code, "body": e.read().decode()[:800]}
