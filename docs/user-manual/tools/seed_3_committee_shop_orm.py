from datetime import date
from decimal import Decimal
from clubs.models import Club
from members.models import Member
from accounts.models import User
from clubmgmt.models import Committee, CommitteeMandate, ShopItem, ShopVariant, ShopMovement
from clubmgmt.shop import new_qr_token, move_stock, sync_item_prices
club = Club.objects.get(name="TKD Club Uelzecht (Demo)")
anne = Member.objects.get(club=club, first_name="Anne", last_name="REDING")
jeff = Member.objects.get(club=club, first_name="Jeff", last_name="LORANG")
adults = [m for m in Member.objects.filter(club=club, date_of_birth__year__lt=1990)]
com, _ = Committee.objects.get_or_create(scope="club", club=club, defaults={"name": "Club committee"})
def mandate(role, m, title=""):
    if not CommitteeMandate.objects.filter(committee=com, role=role).exists():
        CommitteeMandate.objects.create(committee=com, role=role, member=m, title=title, started_on=date(2024, 3, 1))
mandate("president", anne); mandate("secretary", jeff)
if adults: mandate("treasurer", [a for a in adults if a not in (anne, jeff)][0])
admin_u = User.objects.get(username="anne.reding")
items = [("Dobok (uniform)", "dobok", "35.00", "18.00", [("120", 3), ("130", 4), ("140", 2), ("150", 0), ("160", 2)]),
         ("Belt", "belt", "8.00", "3.00", [("Yellow", 6), ("Green", 5), ("Blue", 4), ("Red", 1)]),
         ("Sparring gloves", "sparring", "29.00", "15.00", [("S", 2), ("M", 3), ("L", 1)]),
         ("Club T-shirt", "tshirt", "15.00", "6.50", [("XS", 4), ("S", 5), ("M", 3), ("L", 0)])]
for i, (name, cat, sale, cost, variants) in enumerate(items, 1):
    if ShopItem.objects.filter(club=club, name=name).exists(): continue
    it = ShopItem.objects.create(club=club, sku=f"UEL-{i:03d}", name=name, category=cat, sale_price=Decimal(sale), cost_price=Decimal(cost))
    for label, q in variants:
        v = ShopVariant.objects.create(item=it, label=label, qr_token=new_qr_token(), quantity=0, sale_price=Decimal(sale), cost_price=Decimal(cost))
        if q: move_stock(v, kind=ShopMovement.Kind.RECEIVE, delta=q, note="Opening stock", actor=admin_u, force=True)
    sync_item_prices(it)
print("ORM2 OK")
