from datetime import date

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import FileExtensionValidator
from django.db import models
from django.db.models import Q
from django.utils.translation import gettext_lazy as _


def validate_luxembourg_ssn(value: str) -> None:
    raw = str(value or "").strip()
    if not raw:
        return
    if not raw.isdigit() or len(raw) != 13:
        raise ValidationError(_("Social security number must be 13 digits."))
    try:
        date(int(raw[0:4]), int(raw[4:6]), int(raw[6:8]))
    except ValueError as exc:
        raise ValidationError(_("Social security number must start with a valid date of birth.")) from exc


class Person(models.Model):
    """A person who may be a contact, emergency contact, or non-member official."""

    class Sex(models.TextChoices):
        MALE = "M", _("Male")
        FEMALE = "F", _("Female")

    club = models.ForeignKey(
        "clubs.Club",
        on_delete=models.CASCADE,
        related_name="clubmgmt_people",
        null=True,
        blank=True,
    )
    first_name = models.CharField(max_length=150)
    last_name = models.CharField(max_length=150)
    sex = models.CharField(max_length=1, choices=Sex.choices, default=Sex.MALE)
    converted_member = models.OneToOneField(
        "members.Member",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="converted_from_person",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["last_name", "first_name"]

    def save(self, *args, **kwargs):
        first_name_value = str(self.first_name or "")
        if first_name_value:
            words = first_name_value.split()
            formatted_words = []
            for word in words:
                if "-" in word:
                    formatted_words.append("-".join(part.capitalize() for part in word.split("-")))
                else:
                    formatted_words.append(word.capitalize())
            self.first_name = " ".join(formatted_words)
        last_name_value = str(self.last_name or "")
        if last_name_value:
            words = last_name_value.split()
            formatted_words = []
            for word in words:
                if "-" in word:
                    formatted_words.append("-".join(part.upper() for part in word.split("-")))
                else:
                    formatted_words.append(word.upper())
            self.last_name = " ".join(formatted_words)
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return f"{self.first_name} {self.last_name}"


class PersonEmail(models.Model):
    person = models.ForeignKey(Person, on_delete=models.CASCADE, related_name="emails")
    email = models.EmailField()
    use_for_invoice = models.BooleanField(default=False)

    class Meta:
        ordering = ["id"]


class PersonPhone(models.Model):
    person = models.ForeignKey(Person, on_delete=models.CASCADE, related_name="phones")
    number = models.CharField(max_length=40)
    label = models.CharField(max_length=40, blank=True)

    class Meta:
        ordering = ["id"]


class PersonAddress(models.Model):
    person = models.ForeignKey(Person, on_delete=models.CASCADE, related_name="addresses")
    street = models.CharField(max_length=255, blank=True)
    house_number = models.CharField(max_length=20, blank=True)
    line2 = models.CharField(max_length=255, blank=True)
    postal_code = models.CharField(max_length=10, blank=True)
    locality = models.CharField(max_length=255, blank=True)
    country = models.CharField(max_length=64, default="Luxembourg")
    use_for_invoice = models.BooleanField(default=False)

    class Meta:
        ordering = ["id"]


class MemberRecord(models.Model):
    class InvoiceDelivery(models.TextChoices):
        EMAIL = "email", _("Email")
        POST = "post", _("Post")
        HAND = "hand", _("In person")

    member = models.OneToOneField(
        "members.Member",
        on_delete=models.CASCADE,
        related_name="club_record",
    )
    invoice_delivery = models.CharField(
        max_length=10,
        choices=InvoiceDelivery.choices,
        default=InvoiceDelivery.EMAIL,
    )
    membership_fee = models.ForeignKey(
        "MembershipFee",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="member_records",
    )
    pays_license_fee = models.BooleanField(default=True)
    social_security_number = models.CharField(
        max_length=13,
        blank=True,
        validators=[validate_luxembourg_ssn],
    )
    nationality_1 = models.CharField(max_length=64, blank=True)
    nationality_2 = models.CharField(max_length=64, blank=True)
    joined_at = models.DateField(null=True, blank=True)
    medical_notes = models.TextField(blank=True)
    publish_facebook = models.BooleanField(default=False)
    publish_instagram = models.BooleanField(default=False)
    publish_x = models.BooleanField(default=False)
    publish_tiktok = models.BooleanField(default=False)
    publish_webpage = models.BooleanField(default=False)
    publish_print = models.BooleanField(default=False)
    updated_at = models.DateTimeField(auto_now=True)

    def is_underage(self, today: date | None = None) -> bool:
        dob = getattr(self.member, "date_of_birth", None)
        if not dob:
            return False
        today = today or date.today()
        years = today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
        return years < 18


class MemberEmail(models.Model):
    member = models.ForeignKey("members.Member", on_delete=models.CASCADE, related_name="club_emails")
    email = models.EmailField()
    use_for_invoice = models.BooleanField(default=False)

    class Meta:
        ordering = ["id"]


class MemberPhone(models.Model):
    member = models.ForeignKey("members.Member", on_delete=models.CASCADE, related_name="club_phones")
    number = models.CharField(max_length=40)
    label = models.CharField(max_length=40, blank=True)

    class Meta:
        ordering = ["id"]


class MemberAddress(models.Model):
    member = models.ForeignKey("members.Member", on_delete=models.CASCADE, related_name="club_addresses")
    street = models.CharField(max_length=255, blank=True)
    house_number = models.CharField(max_length=20, blank=True)
    line2 = models.CharField(max_length=255, blank=True)
    postal_code = models.CharField(max_length=10, blank=True)
    locality = models.CharField(max_length=255, blank=True)
    country = models.CharField(max_length=64, default="Luxembourg")
    use_for_invoice = models.BooleanField(default=False)

    class Meta:
        ordering = ["id"]


class MemberContact(models.Model):
    class Relation(models.TextChoices):
        FATHER = "father", _("Father")
        MOTHER = "mother", _("Mother")
        GRANDFATHER = "grandfather", _("Grandfather")
        GRANDMOTHER = "grandmother", _("Grandmother")
        UNCLE = "uncle", _("Uncle")
        AUNT = "aunt", _("Aunt")
        BROTHER = "brother", _("Brother")
        SISTER = "sister", _("Sister")
        GUARDIAN = "guardian", _("Guardian")
        PARTNER = "partner", _("Partner")
        SPOUSE = "spouse", _("Spouse")
        OTHER = "other", _("Other")

    member = models.ForeignKey("members.Member", on_delete=models.CASCADE, related_name="club_contacts")
    person = models.ForeignKey(Person, on_delete=models.CASCADE, related_name="member_links")
    relation = models.CharField(max_length=20, choices=Relation.choices)
    is_emergency = models.BooleanField(default=False)
    is_primary = models.BooleanField(default=False)

    class Meta:
        ordering = ["id"]
        constraints = [
            models.UniqueConstraint(fields=["member", "person"], name="clubmgmt_member_person_uniq"),
            models.UniqueConstraint(
                fields=["member"],
                condition=Q(is_primary=True),
                name="clubmgmt_one_primary_contact",
            ),
        ]


class MedicalCheckup(models.Model):
    member = models.ForeignKey(
        "members.Member",
        on_delete=models.CASCADE,
        related_name="medical_checkups",
    )
    checked_on = models.DateField()
    valid_until = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-checked_on", "-id"]


class Family(models.Model):
    club = models.ForeignKey("clubs.Club", on_delete=models.CASCADE, related_name="families")
    name = models.CharField(max_length=150)
    invoice_member = models.ForeignKey(
        "members.Member",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="families_invoiced",
    )
    bill_to_person = models.ForeignKey(
        Person,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="families_billed",
    )
    bill_to_delivery = models.CharField(
        max_length=10,
        choices=MemberRecord.InvoiceDelivery.choices,
        blank=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class FamilyMember(models.Model):
    family = models.ForeignKey(Family, on_delete=models.CASCADE, related_name="memberships")
    member = models.ForeignKey("members.Member", on_delete=models.CASCADE, related_name="family_links")
    sort_order = models.PositiveSmallIntegerField(default=1)

    class Meta:
        ordering = ["sort_order", "id"]
        constraints = [
            models.UniqueConstraint(fields=["family", "member"], name="clubmgmt_family_member_uniq"),
        ]


class MembershipFee(models.Model):
    club = models.ForeignKey("clubs.Club", on_delete=models.CASCADE, related_name="membership_fees")
    name = models.CharField(max_length=120)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    year = models.PositiveIntegerField(null=True, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]


class MembershipFeePrice(models.Model):
    fee = models.ForeignKey(MembershipFee, on_delete=models.CASCADE, related_name="prices")
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    effective_from = models.DateField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-effective_from", "-id"]

    @classmethod
    def amount_for_year(cls, fee: MembershipFee, year: int):
        as_of = date(year, 12, 31)
        row = cls.objects.filter(fee=fee, effective_from__lte=as_of).order_by("-effective_from", "-id").first()
        return row.amount if row else fee.amount


class MembershipBilling(models.Model):
    """One charge of the membership fee. A year with no rows is a single billing.

    One billing per year carries the license fee. That is the first billing until
    the club chooses another, for a season that opens on a later bill.
    """

    club = models.ForeignKey("clubs.Club", on_delete=models.CASCADE, related_name="membership_billings")
    year = models.PositiveIntegerField()
    sequence = models.PositiveSmallIntegerField()
    label = models.CharField(max_length=80, blank=True)
    charges_license_fee = models.BooleanField(default=False)

    class Meta:
        ordering = ["year", "sequence", "id"]
        constraints = [
            models.UniqueConstraint(fields=["club", "year", "sequence"], name="clubmgmt_billing_seq_uniq"),
        ]

    def __str__(self) -> str:
        return f"{self.year} #{self.sequence} {self.label}".strip()


class ClubLicenseFee(models.Model):
    """Charged once per member on the billing chosen for that year. Not rebated."""

    club = models.OneToOneField("clubs.Club", on_delete=models.CASCADE, related_name="license_fee")
    name = models.CharField(max_length=120, default="License fee")
    amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    class Meta:
        ordering = ["club_id"]

    def __str__(self) -> str:
        return f"{self.name} {self.amount}"


class ClubLicenseFeePrice(models.Model):
    fee = models.ForeignKey(ClubLicenseFee, on_delete=models.CASCADE, related_name="prices")
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    effective_from = models.DateField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-effective_from", "-id"]

    @classmethod
    def amount_for_year(cls, fee: ClubLicenseFee, year: int):
        as_of = date(year, 12, 31)
        row = cls.objects.filter(fee=fee, effective_from__lte=as_of).order_by("-effective_from", "-id").first()
        return row.amount if row else fee.amount


class FamilyRebateRule(models.Model):
    """Rank 1 is full price unless it has its own rule.

    A later rank with no rule pays full price. When applies_to_later is set, that
    rebate also covers every following member until a later rank has its own rule.
    """

    club = models.ForeignKey("clubs.Club", on_delete=models.CASCADE, related_name="family_rebate_rules")
    member_rank = models.PositiveSmallIntegerField()
    percent_off = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    amount_off = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    applies_to_later = models.BooleanField(default=False)

    class Meta:
        ordering = ["member_rank"]
        constraints = [
            models.UniqueConstraint(fields=["club", "member_rank"], name="clubmgmt_rebate_rank_uniq"),
        ]


class MembershipYearConfirmation(models.Model):
    """Complimentary (0,00) club dues confirmed for a billing year. Not an invoice."""

    club = models.ForeignKey(
        "clubs.Club",
        on_delete=models.CASCADE,
        related_name="membership_year_confirmations",
    )
    year = models.PositiveIntegerField()
    installment = models.PositiveSmallIntegerField(default=1)
    household_key = models.CharField(max_length=40)
    confirmed_at = models.DateTimeField(auto_now_add=True)
    confirmed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="membership_year_confirmations",
    )

    class Meta:
        ordering = ["-year", "household_key"]
        constraints = [
            models.UniqueConstraint(
                fields=["club", "year", "installment", "household_key"],
                name="clubmgmt_year_confirm_uniq",
            ),
        ]


class Committee(models.Model):
    class Scope(models.TextChoices):
        FEDERATION = "federation", _("Federation")
        CLUB = "club", _("Club")

    scope = models.CharField(max_length=16, choices=Scope.choices)
    club = models.ForeignKey(
        "clubs.Club",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="committees",
    )
    name = models.CharField(max_length=150)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]

    def clean(self):
        if self.scope == self.Scope.CLUB and not self.club_id:
            raise ValidationError({"club": _("A club committee needs a club.")})
        if self.scope == self.Scope.FEDERATION and self.club_id:
            raise ValidationError({"club": _("A federation committee cannot be tied to a club.")})


class CommitteeMandate(models.Model):
    class Role(models.TextChoices):
        PRESIDENT = "president", _("President")
        VICE_PRESIDENT = "vice_president", _("Vice President")
        SECRETARY_GENERAL = "secretary_general", _("Secretary General")
        TREASURER = "treasurer", _("Treasurer")
        SECRETARY = "secretary", _("Secretary")
        COMMITTEE_MEMBER = "committee_member", _("Committee member")
        CASHIER_AUDITOR = "cashier_auditor", _("Cashier auditor")
        OTHER = "other", _("Other")

    committee = models.ForeignKey(Committee, on_delete=models.CASCADE, related_name="mandates")
    role = models.CharField(max_length=32, choices=Role.choices)
    title = models.CharField(max_length=120, blank=True)
    member = models.ForeignKey(
        "members.Member",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="committee_mandates",
    )
    person = models.ForeignKey(
        Person,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="committee_mandates",
    )
    started_on = models.DateField()
    ended_on = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True)

    UNIQUE_CURRENT_ROLES = frozenset(
        {
            Role.PRESIDENT,
            Role.VICE_PRESIDENT,
            Role.SECRETARY_GENERAL,
            Role.TREASURER,
            Role.SECRETARY,
        }
    )

    class Meta:
        ordering = ["-started_on", "id"]

    @staticmethod
    def member_is_adult(member, as_of: date | None = None) -> bool:
        dob = getattr(member, "date_of_birth", None)
        if dob is None:
            return False
        as_of = as_of or date.today()
        years = as_of.year - dob.year - ((as_of.month, as_of.day) < (dob.month, dob.day))
        return years >= 18

    @classmethod
    def overlapping_office_exists(
        cls,
        *,
        committee: "Committee",
        role: str,
        started_on: date,
        ended_on: date | None,
        title: str = "",
        exclude_pk: int | None = None,
    ) -> bool:
        if role not in cls.UNIQUE_CURRENT_ROLES and role != cls.Role.OTHER:
            return False
        qs = cls.objects.filter(role=role)
        if committee.scope == Committee.Scope.CLUB and committee.club_id:
            qs = qs.filter(committee__club_id=committee.club_id)
        elif committee.scope == Committee.Scope.FEDERATION:
            qs = qs.filter(committee__scope=Committee.Scope.FEDERATION)
        else:
            qs = qs.filter(committee=committee)
        if role == cls.Role.OTHER:
            qs = qs.filter(title=title or "")
        if exclude_pk:
            qs = qs.exclude(pk=exclude_pk)
        qs = qs.filter(Q(ended_on__isnull=True) | Q(ended_on__gte=started_on))
        if ended_on is not None:
            qs = qs.filter(started_on__lte=ended_on)
        return qs.exists()

    def clean(self):
        if self.member_id and self.person_id:
            raise ValidationError(_("Choose either a member or a person, not both."))
        if self.ended_on and self.ended_on < self.started_on:
            raise ValidationError({"ended_on": _("End must be on or after the start.")})
        if self.member_id and not self.member_is_adult(self.member, self.started_on or date.today()):
            raise ValidationError({"member": _("Committee members must be 18 or older.")})
        if self.committee_id and self.started_on and self.overlapping_office_exists(
            committee=self.committee,
            role=self.role,
            started_on=self.started_on,
            ended_on=self.ended_on,
            title=self.title,
            exclude_pk=self.pk,
        ):
            raise ValidationError({"role": _("This office is already held for that period.")})


class ShopItem(models.Model):
    class Category(models.TextChoices):
        DOBOK = "dobok", _("Dobok")
        BELT = "belt", _("Belt")
        PROTECTOR = "protector", _("Protector")
        SPARRING = "sparring", _("Sparring")
        FOOTWEAR = "footwear", _("Footwear")
        TSHIRT = "tshirt", _("Club T-shirt")
        MERCHANDISE = "merchandise", _("Merchandise")
        OTHER = "other", _("Other")

    club = models.ForeignKey("clubs.Club", on_delete=models.CASCADE, related_name="shop_items")
    sku = models.CharField(max_length=20)
    name = models.CharField(max_length=150)
    description = models.TextField(blank=True)
    category = models.CharField(max_length=20, choices=Category.choices, default=Category.OTHER)
    photo = models.ImageField(upload_to="club-shop/%Y/%m/", blank=True)
    sale_price = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    cost_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    track_stock = models.BooleanField(default=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name", "id"]
        constraints = [
            models.UniqueConstraint(fields=["club", "sku"], name="clubmgmt_shop_sku_uniq"),
        ]

    def __str__(self):
        return f"{self.sku} {self.name}"

    @property
    def quantity(self) -> int:
        return sum(row.quantity for row in self.variants.all() if row.is_active)


class ShopVariant(models.Model):
    item = models.ForeignKey(ShopItem, on_delete=models.CASCADE, related_name="variants")
    label = models.CharField(max_length=40, default="Standard")
    qr_token = models.CharField(max_length=24, unique=True)
    quantity = models.IntegerField(default=0)
    reorder_level = models.PositiveIntegerField(default=2)
    sale_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    cost_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["id"]
        constraints = [
            models.UniqueConstraint(fields=["item", "label"], name="clubmgmt_shop_variant_label_uniq"),
        ]

    def __str__(self):
        return f"{self.item.sku} {self.label}"

    def resolved_sale_price(self):
        if self.sale_price is not None:
            return self.sale_price
        return self.item.sale_price or 0

    def resolved_cost_price(self):
        if self.cost_price is not None:
            return self.cost_price
        return self.item.cost_price


class ShopMovement(models.Model):
    class Kind(models.TextChoices):
        RECEIVE = "receive", _("Received")
        SALE = "sale", _("Sold")
        RETURN = "return", _("Returned")
        ADJUST = "adjust", _("Adjusted")
        COUNT = "count", _("Counted")

    variant = models.ForeignKey(ShopVariant, on_delete=models.CASCADE, related_name="movements")
    kind = models.CharField(max_length=12, choices=Kind.choices)
    quantity_delta = models.IntegerField()
    quantity_after = models.IntegerField()
    note = models.CharField(max_length=255, blank=True)
    sale = models.ForeignKey(
        "ShopSale",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="movements",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="shop_movements",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]


class ShopSale(models.Model):
    class Status(models.TextChoices):
        COMPLETED = "completed", _("Completed")
        UNPAID = "unpaid", _("Unpaid")
        CANCELLED = "cancelled", _("Cancelled")

    class PayMethod(models.TextChoices):
        CASH = "cash", _("Cash")
        CARD = "card", _("Card")
        OTHER = "other", _("Other")
        UNPAID = "unpaid", _("Pay later")

    club = models.ForeignKey("clubs.Club", on_delete=models.CASCADE, related_name="shop_sales")
    sale_number = models.CharField(max_length=20, unique=True)
    member = models.ForeignKey(
        "members.Member",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="shop_purchases",
    )
    walk_in_name = models.CharField(max_length=150, blank=True)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.COMPLETED)
    payment_method = models.CharField(max_length=12, choices=PayMethod.choices, default=PayMethod.CASH)
    total = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    income = models.ForeignKey(
        "licenses.Income",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="shop_sales",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="shop_sales_recorded",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    paid_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at", "-id"]


class ShopSaleLine(models.Model):
    sale = models.ForeignKey(ShopSale, on_delete=models.CASCADE, related_name="lines")
    variant = models.ForeignKey(ShopVariant, on_delete=models.PROTECT, related_name="sale_lines")
    quantity = models.PositiveIntegerField()
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)
    name_snapshot = models.CharField(max_length=180)

    class Meta:
        ordering = ["id"]


class ShopSnapshot(models.Model):
    club = models.ForeignKey("clubs.Club", on_delete=models.CASCADE, related_name="shop_snapshots")
    taken_at = models.DateTimeField(auto_now_add=True)
    note = models.CharField(max_length=255, blank=True)
    taken_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="shop_snapshots_taken",
    )

    class Meta:
        ordering = ["-taken_at", "-id"]


class ShopSnapshotLine(models.Model):
    snapshot = models.ForeignKey(ShopSnapshot, on_delete=models.CASCADE, related_name="lines")
    sku = models.CharField(max_length=20)
    name = models.CharField(max_length=180)
    variant_label = models.CharField(max_length=40)
    quantity = models.IntegerField()
    sale_price = models.DecimalField(max_digits=10, decimal_places=2)
    cost_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    reorder_level = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["name", "variant_label", "id"]

    @property
    def line_value(self):
        return (self.sale_price or 0) * self.quantity


class SubsidySeason(models.Model):
    class Status(models.TextChoices):
        DRAFT = "draft", _("Draft")
        READY = "ready", _("Ready")
        SUBMITTED = "submitted", _("Submitted")
        PAID = "paid", _("Paid")

    club = models.ForeignKey("clubs.Club", on_delete=models.CASCADE, related_name="subsidy_seasons")
    year = models.PositiveIntegerField()
    deadline = models.DateField()
    season_complete = models.BooleanField(default=False)
    myguichet_users = models.PositiveSmallIntegerField(default=0)
    rib_attached = models.BooleanField(default=False)
    non_licensed_count = models.PositiveIntegerField(default=0)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    submitted_on = models.DateField(null=True, blank=True)
    paid_on = models.DateField(null=True, blank=True)
    paid_amount = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    rib_file = models.FileField(
        upload_to="club-subsidies/rib/%Y/",
        blank=True,
        validators=[FileExtensionValidator(["pdf", "jpg", "jpeg", "png", "webp"])],
    )
    income = models.ForeignKey(
        "licenses.Income",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="subsidy_seasons",
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = [("club", "year")]
        ordering = ["-year"]


class CoachQualification(models.Model):
    class Level(models.TextChoices):
        EQF1 = "eqf1", "EQF 1"
        EQF2 = "eqf2", "EQF 2"
        EQF2BIS = "eqf2bis", "EQF 2 bis"
        EQF3 = "eqf3", "EQF 3"
        EQF4 = "eqf4", "EQF 4"
        EQF5 = "eqf5", "EQF 5"
        EQF6 = "eqf6", "EQF 6"

    class Diploma(models.TextChoices):
        MISSING = "missing", _("Missing")
        IN_PROGRESS = "in_progress", _("In progress")
        ATTACHED = "attached", _("Attached")

    club = models.ForeignKey("clubs.Club", on_delete=models.CASCADE, related_name="coach_qualifications")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="coach_qualifications")
    eqf_level = models.CharField(max_length=10, choices=Level.choices, blank=True)
    coaches_under_16 = models.BooleanField(default=False)
    include_in_qualite = models.BooleanField(default=True)
    diploma_status = models.CharField(max_length=20, choices=Diploma.choices, default=Diploma.MISSING)
    diploma_file = models.FileField(
        upload_to="club-subsidies/diplomas/%Y/",
        blank=True,
        validators=[FileExtensionValidator(["pdf", "jpg", "jpeg", "png", "webp"])],
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = [("club", "user")]


class ExtraordinarySubsidy(models.Model):
    class Kind(models.TextChoices):
        CUP = "cup", _("Official international cup")
        CHAMPIONSHIP = "championship", _("World or European championship")
        ORGANISATION = "organisation", _("Championship hosted in Luxembourg")

    class Status(models.TextChoices):
        DRAFT = "draft", _("Draft")
        PRELIMINARY = "preliminary", _("Preliminary request")
        AGREED = "agreed", _("Principle agreement")
        ACCOUNTED = "accounted", _("Final account")

    class Travel(models.TextChoices):
        TRAIN = "train", _("Train")
        CAR = "car", _("Car")
        PLANE = "plane", _("Plane")

    club = models.ForeignKey("clubs.Club", on_delete=models.CASCADE, related_name="extraordinary_subsidies")
    year = models.PositiveIntegerField()
    kind = models.CharField(max_length=20, choices=Kind.choices)
    title = models.CharField(max_length=255)
    place = models.CharField(max_length=255, blank=True)
    starts_on = models.DateField(null=True, blank=True)
    ends_on = models.DateField(null=True, blank=True)
    athlete_ids = models.JSONField(default=list, blank=True)
    official_ids = models.JSONField(default=list, blank=True)
    travel_mode = models.CharField(max_length=20, choices=Travel.choices, blank=True)
    travel_units = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    travel_rate = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    stay_people = models.PositiveIntegerField(default=0)
    stay_days = models.PositiveIntegerField(default=0)
    stay_rate = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    entry_fee = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    medical_fee = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    supplies_fee = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    notes = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-starts_on", "-id"]


from . import training_models as _training_models  # noqa: E402,F401
