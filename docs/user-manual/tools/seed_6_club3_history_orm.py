from datetime import date, timedelta
from django.utils import timezone
from accounts.models import User
from clubs.models import Club
from members.models import Member
from licenses.models import License, LicenseHistoryEvent
c3 = Club.objects.get(name="Dojang Musel (Demo)")
m = Member.objects.filter(club=c3, is_active=True).first()
u, created = User.objects.get_or_create(username="paul.musel", defaults={"role": "club_admin", "email": "paul@musel.example.org", "first_name": "Paul"})
u.set_password("Demo-Manual-2026!"); u.is_email_verified = True; u.consent_given = True; u.save()
if m and not m.user: m.user = u; m.save()
c3.admins.add(u)
# license history for Sandra
s = Member.objects.get(first_name="Sandra", last_name="WEIS")
for lic in License.objects.filter(member=s):
    if not LicenseHistoryEvent.objects.filter(license=lic).exists():
        LicenseHistoryEvent.objects.create(member=s, license=lic, club=lic.club, event_type="issued", license_year=lic.year,
            status_after=lic.status, club_name_snapshot=lic.club.name, event_at=timezone.now() - timedelta(days=365 * (date.today().year - lic.year)))
print("ORM3 OK")
