from rest_framework import serializers

from .models import Event


class EventSerializer(serializers.ModelSerializer):
    club_name = serializers.CharField(source="club.name", read_only=True)
    can_edit = serializers.SerializerMethodField()

    class Meta:
        model = Event
        fields = [
            "id",
            "title",
            "description",
            "kind",
            "owner_scope",
            "club",
            "club_name",
            "venue_name",
            "venue_address",
            "starts_at",
            "ends_at",
            "all_day",
            "visibility",
            "created_by",
            "created_at",
            "updated_at",
            "can_edit",
        ]
        read_only_fields = ["created_by", "created_at", "updated_at", "club_name", "can_edit"]

    def get_can_edit(self, obj: Event) -> bool:
        request = self.context.get("request")
        user = getattr(request, "user", None)
        from .access import can_manage_event

        return can_manage_event(user, obj)

    def validate_kind(self, value: str) -> str:
        if value != Event.Kind.CALENDAR:
            raise serializers.ValidationError(
                "Kyorugi and Poomsae events need those tournament modules."
            )
        return value

    def validate(self, attrs):
        owner_scope = attrs.get("owner_scope", getattr(self.instance, "owner_scope", None))
        club = attrs.get("club", getattr(self.instance, "club", None))
        starts_at = attrs.get("starts_at", getattr(self.instance, "starts_at", None))
        ends_at = attrs.get("ends_at", getattr(self.instance, "ends_at", None))
        if owner_scope == Event.OwnerScope.CLUB and club is None:
            raise serializers.ValidationError({"club": "A club event needs a club."})
        if owner_scope == Event.OwnerScope.FEDERATION and club is not None:
            raise serializers.ValidationError({"club": "A federation event cannot be tied to a club."})
        if starts_at and ends_at and ends_at < starts_at:
            raise serializers.ValidationError({"ends_at": "End must be on or after the start."})
        return attrs
