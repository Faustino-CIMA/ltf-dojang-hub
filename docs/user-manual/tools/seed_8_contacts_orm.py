"""Figure fill-in (ORM): club-record contacts for Tom SCHMIT and a grade history for Sandra WEIS.

Run inside the backend venv:  python manage.py shell < seed_8_contacts_orm.py
All names, numbers and addresses are invented.
"""
from datetime import date
from clubs.models import Club
from members.models import Member
from clubmgmt.models import (MemberRecord, MemberEmail, MemberPhone, MemberAddress, Person, PersonEmail,
                             PersonPhone, MemberContact)
club = Club.objects.get(name="TKD Club Uelzecht (Demo)")
tom = Member.objects.get(club=club, first_name="Tom", last_name="SCHMIT")
rec, _ = MemberRecord.objects.get_or_create(member=tom)
rec.joined_at = rec.joined_at or date(2019, 9, 16)
rec.nationality_1 = rec.nationality_1 or "Luxembourg"
rec.save()
if not tom.club_emails.exists():
    MemberEmail.objects.create(member=tom, email="tom.schmit@example.org", use_for_invoice=False)
if not tom.club_phones.exists():
    MemberPhone.objects.create(member=tom, number="+352 621 000 412", label="Mobile")
if not tom.club_addresses.exists():
    MemberAddress.objects.create(member=tom, street="Rue de la Gare", house_number="12", postal_code="7520",
                                 locality="Mersch", country="Luxembourg", use_for_invoice=True)
if not tom.club_contacts.exists():
    p = Person.objects.create(club=club, first_name="Marc", last_name="SCHMIT", sex="M")
    PersonEmail.objects.create(person=p, email="marc.schmit@example.org", use_for_invoice=True)
    PersonPhone.objects.create(person=p, number="+352 691 000 733", label="Mobile")
    MemberContact.objects.create(member=tom, person=p, relation="father", is_emergency=True, is_primary=True)
from members.models import GradePromotionHistory
sandra = Member.objects.get(club=club, first_name="Sandra", last_name="WEIS")
if not GradePromotionHistory.objects.filter(member=sandra).exists():
    y = date.today().year
    for g, d in (("4th Kup", date(y - 2, 6, 18)), ("3rd Kup", date(y - 1, 6, 17)), ("2nd Kup", date(y, 6, 14))):
        GradePromotionHistory.objects.create(member=sandra, club=club, to_grade=g, promotion_date=d, created_by="Jeff LORANG")
print("SEED8 OK")
