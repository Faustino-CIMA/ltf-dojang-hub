from rest_framework import serializers

from accounts.models import User

from .models import AuthEvent, OpsAuditLog, SecurityAlert


class OpsUserSerializer(serializers.ModelSerializer):
    linked_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "role",
            "is_active",
            "is_superuser",
            "is_staff",
            "is_email_verified",
            "last_login",
            "date_joined",
            "linked_name",
        ]
        read_only_fields = fields

    def get_linked_name(self, obj) -> str:
        from clubmgmt.models import Person
        from members.models import Member

        member = Member.all_objects.filter(user_id=obj.pk).only("first_name", "last_name").first()
        if member is not None:
            return " ".join(part for part in (member.last_name, member.first_name) if part).strip()
        person = Person.objects.filter(user_id=obj.pk).only("first_name", "last_name").first()
        if person is None:
            return ""
        return " ".join(part for part in (person.last_name, person.first_name) if part).strip()


class AuthEventSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source="user.username", read_only=True, default="")

    class Meta:
        model = AuthEvent
        fields = [
            "id",
            "event_type",
            "username_attempted",
            "username",
            "user",
            "ip",
            "user_agent",
            "metadata",
            "created_at",
        ]


class SecurityAlertSerializer(serializers.ModelSerializer):
    related_username = serializers.CharField(
        source="related_user.username", read_only=True, default=""
    )

    class Meta:
        model = SecurityAlert
        fields = [
            "id",
            "severity",
            "code",
            "title",
            "detail",
            "status",
            "related_user",
            "related_username",
            "ip",
            "metadata",
            "created_at",
            "updated_at",
            "resolved_at",
        ]


class OpsAuditLogSerializer(serializers.ModelSerializer):
    actor_name = serializers.CharField(source="actor.username", read_only=True, default="")

    class Meta:
        model = OpsAuditLog
        fields = [
            "id",
            "actor",
            "actor_name",
            "action",
            "target_type",
            "target_id",
            "message",
            "ip",
            "metadata",
            "created_at",
        ]
