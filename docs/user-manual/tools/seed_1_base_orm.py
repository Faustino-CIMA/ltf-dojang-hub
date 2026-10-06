"""Seed a fictional demo dataset for manual screenshots.

Run inside the backend venv:  python manage.py shell < seed_1_base_orm.py
All names, addresses and IDs are invented. No real personal data.
"""
import random
from datetime import date, time, timedelta, datetime
from decimal import Decimal

from django.utils import timezone
from django.core.management import call_command

from accounts.models import User
from clubs.models import Club, FederationProfile
from members.models import Member, GradePromotionHistory
from licenses.models import LicenseType, LicensePrice, License, LicenseTypePolicy
from modules.entitlements import redeem_product_code, set_club_assignment
from modules import codes

random.seed(7)
PWD = "Demo-Manual-2026!"
TODAY = date.today()
YEAR = TODAY.year

def mkuser(username, role, first, last, email, superuser=False):
    u, _ = User.objects.get_or_create(username=username, defaults={"role": role})
    u.role = role; u.first_name = first; u.last_name = last; u.email = email
    u.is_email_verified = True; u.consent_given = True; u.consent_given_at = timezone.now()
    u.is_superuser = superuser; u.is_staff = superuser
    u.set_password(PWD); u.save()
    return u

ops = mkuser("ops.demo", User.Roles.LTF_ADMIN, "Ops", "Demo", "ops@example.org", superuser=True)
ltf_admin = mkuser("ltf.admin", User.Roles.LTF_ADMIN, "Claire", "Federatioun", "admin@ltf.example.org")
ltf_fin = mkuser("ltf.finance", User.Roles.LTF_FINANCE, "Marc", "Kees", "finance@ltf.example.org")

fp = FederationProfile.objects.first() or FederationProfile.objects.create()
fp.name = "Luxembourg Taekwondo Federation"; fp.postal_code = "L-1234"; fp.locality = "Luxembourg"
fp.save()

club, _ = Club.objects.get_or_create(name="TKD Club Uelzecht (Demo)", defaults=dict(created_by=ltf_admin,
    city="Mersch", address="1, rue du Sport", postal_code="7520", locality="Mersch",
    iban="LU280019400644750000", bank_name="Demo Bank", email="info@uelzecht.example.org",
    website="https://uelzecht.example.org"))
club2, _ = Club.objects.get_or_create(name="Dojang Musel (Demo)", defaults=dict(created_by=ltf_admin,
    city="Remich", address="5, route du Vin", postal_code="5501", locality="Remich",
    email="info@musel.example.org"))
club3, _ = Club.objects.get_or_create(name="Taekwondo Ösling (Demo)", defaults=dict(created_by=ltf_admin,
    city="Wiltz", postal_code="9501", locality="Wiltz", email="info@oesling.example.org"))

lt, _ = LicenseType.objects.get_or_create(code="annual", defaults={"name": "Annual license"})
LicenseTypePolicy.objects.get_or_create(license_type=lt)
if not LicensePrice.objects.filter(license_type=lt).exists():
    LicensePrice.objects.create(license_type=lt, amount=Decimal("40.00"), effective_from=date(YEAR, 1, 1))
lt2, _ = LicenseType.objects.get_or_create(code="official", defaults={"name": "Official license"})
LicenseTypePolicy.objects.get_or_create(license_type=lt2)
if not LicensePrice.objects.filter(license_type=lt2).exists():
    LicensePrice.objects.create(license_type=lt2, amount=Decimal("25.00"), effective_from=date(YEAR, 1, 1))

FIRST_M = ["Luca", "Noah", "Ben", "Tom", "Max", "Leo", "Paul", "Felix", "Jang", "Mika", "David", "Sven"]
FIRST_F = ["Emma", "Lena", "Mia", "Sophie", "Lara", "Zoé", "Nora", "Anna", "Julie", "Lisa", "Eva", "Maja"]
LAST = ["Schmit", "Weber", "Muller", "Wagner", "Hoffmann", "Thill", "Kremer", "Reuter", "Kieffer",
        "Majerus", "Ferreira", "Da Silva", "Hansen", "Becker", "Klein", "Schroeder", "Bausch", "Lentz"]
BELTS = ["10th Kup", "8th Kup", "6th Kup", "4th Kup", "2nd Kup", "1st Kup", "1st Poom", "1st Dan", "2nd Dan", "3rd Dan"]

def mkmember(c, first, last, sex, dob, role="Athlete", active=True, belt=None, idx=0):
    m, created = Member.objects.get_or_create(club=c, first_name=first, last_name=last.upper(), defaults=dict(
        sex=sex, date_of_birth=dob, primary_license_role=role, is_active=active,
        belt_rank=belt or random.choice(BELTS), email=f"{first.lower()}.{last.lower().replace(' ','')}@example.org",
        ltf_licenseid=f"LTF-{c.id:02d}{idx:04d}", wt_licenseid=f"LUX-9{c.id}{idx:04d}"))
    return m

members = []
for c, n in ((club, 34), (club2, 14), (club3, 9)):
    for i in range(n):
        sex = random.choice("MF")
        first = random.choice(FIRST_M if sex == "M" else FIRST_F)
        last = random.choice(LAST)
        age = random.choice([7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 22, 29, 35, 41, 47])
        dob = date(YEAR - age, random.randint(1, 12), random.randint(1, 28))
        m = mkmember(c, first, last, sex, dob, active=(i % 11 != 10), idx=i + 1)
        if c == club: members.append(m)

# Named demo people at the main club
coach_m = mkmember(club, "Jeff", "Lorang", "M", date(1984, 5, 3), role="Coach", belt="4th Dan", idx=900)
coach_m.secondary_license_role = "Athlete"; coach_m.save()
admin_m = mkmember(club, "Anne", "Reding", "F", date(1979, 2, 14), role="Official", belt="1st Dan", idx=901)
member_m = mkmember(club, "Tom", "Schmit", "M", date(2012, 9, 21), belt="4th Kup", idx=902)
member_adult = mkmember(club, "Sandra", "Weis", "F", date(1990, 6, 9), belt="2nd Kup", idx=903)

club_admin = mkuser("anne.reding", User.Roles.CLUB_ADMIN, "Anne", "Reding", "anne@uelzecht.example.org")
admin_m.user = club_admin; admin_m.save()
club.admins.add(club_admin)
coach = mkuser("jeff.lorang", User.Roles.COACH, "Jeff", "Lorang", "jeff@uelzecht.example.org")
coach_m.user = coach; coach_m.save()
club.trainers.add(coach)
memu = mkuser("sandra.weis", User.Roles.MEMBER, "Sandra", "Weis", "sandra@example.org")
member_adult.user = memu; member_adult.save()

# Licenses for the season
for m in Member.objects.all():
    if License.objects.filter(member=m, year=YEAR).exists():
        continue
    if not m.is_active:
        License.objects.create(member=m, club=m.club, license_type=lt, year=YEAR - 1, status="expired")
        continue
    r = random.random()
    if r < 0.78:
        License.objects.create(member=m, club=m.club, license_type=lt, year=YEAR, status="active")
    elif r < 0.9:
        License.objects.create(member=m, club=m.club, license_type=lt, year=YEAR, status="pending")
    License.objects.get_or_create(member=m, club=m.club, license_type=lt, year=YEAR - 1, defaults={"status": "expired"})

# Grade history for the demo member
if not GradePromotionHistory.objects.filter(member=member_m).exists():
    for g, d in (("8th Kup", date(YEAR - 2, 6, 20)), ("6th Kup", date(YEAR - 1, 1, 25)), ("4th Kup", date(YEAR - 1, 12, 13))):
        GradePromotionHistory.objects.create(member=member_m, club=club, to_grade=g, promotion_date=d, created_by="Jeff LORANG")

# Modules: mint + redeem + assign
from modules.models import InstallEntitlement
call_command("ensure_module_keys")
if not InstallEntitlement.objects.filter(module_id="club_management").exists():
    from io import StringIO
    buf = StringIO()
    call_command("mint_module_code", modules="club_management,event_calendar", stdout=buf)
    token = [ln for ln in buf.getvalue().split() if ln.startswith("LTF1.")][0]
    redeem_product_code(token, user=ops)
for c in (club, club2):
    set_club_assignment(club=c, module_id="club_management", enabled=True, user=ops)
    set_club_assignment(club=c, module_id="event_calendar", enabled=True, user=ops)

print("SEED OK", Member.objects.count(), "members", License.objects.count(), "licenses")
