from api import call
L = "ltf.admin"
def T(id, x, y, w, h, mf=None, text=None, size=3.2, bold=False, color="#0B2540"):
    e = {"id": id, "type": "text", "x_mm": x, "y_mm": y, "width_mm": w, "height_mm": h,
         "style": {"font_size_mm": size, "font_weight": "700" if bold else "400", "color": color}}
    if mf: e["merge_field"] = mf
    if text: e["text"] = text
    return e
front = [{"id": "bg", "type": "shape", "x_mm": 0, "y_mm": 0, "width_mm": 85, "height_mm": 12, "style": {"fill_color": "#0B2540"}},
         T("t1", 4, 3, 77, 6, text="LUXEMBOURG TAEKWONDO FEDERATION", size=3, bold=True, color="#FFFFFF"),
         {"id": "ph", "type": "image", "x_mm": 4, "y_mm": 16, "width_mm": 24, "height_mm": 30, "source": "member.profile_picture_processed"},
         T("n", 32, 17, 50, 6, mf="member.full_name", size=3.6, bold=True),
         T("g", 32, 25, 50, 5, mf="member.current_grade"),
         T("id", 32, 32, 50, 5, mf="member.ltf_licenseid"),
         T("c", 32, 39, 50, 5, mf="club.name", size=2.8)]
back = [T("b1", 5, 5, 75, 6, text="Licence card - demo template", size=3, bold=True),
        {"id": "qr", "type": "qr", "x_mm": 58, "y_mm": 26, "width_mm": 22, "height_mm": 22, "merge_fields": ["member.ltf_licenseid"]}]
payload = {"sides": {"front": {"elements": front}, "back": {"elements": back}}}
r = call(L, "POST", "/api/card-template-versions/", {"template": 1, "card_format": 1, "paper_profile": 1, "design_payload": payload})
print(str(r)[:500])
if "id" in r:
    print(str(call(L, "POST", f"/api/card-template-versions/{r['id']}/publish/", {}))[:300])
    print(str(call(L, "POST", "/api/card-templates/1/set-default/", {}))[:200])
