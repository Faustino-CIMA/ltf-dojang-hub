from allauth.account.models import EmailAddress
from django.conf import settings
from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ObjectDoesNotExist
from rest_framework import serializers

from .models import User


class UserSerializer(serializers.ModelSerializer):
    home_club_id = serializers.SerializerMethodField()
    demo_mode = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "role",
            "is_superuser",
            "is_email_verified",
            "consent_given",
            "consent_given_at",
            "home_club_id",
            "demo_mode",
        ]

    def get_demo_mode(self, obj):
        return bool(getattr(settings, "DEMO_MODE", False))

    def get_home_club_id(self, obj):
        try:
            return obj.member_profile.club_id
        except ObjectDoesNotExist:
            return None


class EmptySerializer(serializers.Serializer):
    pass


class LoginResponseSerializer(serializers.Serializer):
    token = serializers.CharField()
    user = UserSerializer()


class DetailResponseSerializer(serializers.Serializer):
    detail = serializers.CharField()


class DataDeleteResponseSerializer(serializers.Serializer):
    deleted_user_id = serializers.IntegerField()


class LicenseExportSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    year = serializers.IntegerField()
    status = serializers.CharField()
    start_date = serializers.DateField()
    end_date = serializers.DateField()


class MemberExportSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    first_name = serializers.CharField()
    last_name = serializers.CharField()
    belt_rank = serializers.CharField()
    club_id = serializers.IntegerField(allow_null=True, required=False)


class ProfilePhotoExportSerializer(serializers.Serializer):
    has_profile_picture = serializers.BooleanField()
    original_url = serializers.CharField(allow_blank=True, required=False)
    processed_url = serializers.CharField(allow_blank=True, required=False)
    thumbnail_url = serializers.CharField(allow_blank=True, required=False)
    download_url = serializers.CharField(allow_blank=True, required=False)
    photo_edit_metadata = serializers.DictField(required=False)
    photo_consent_attested_at = serializers.DateTimeField(allow_null=True, required=False)
    photo_consent_attested_by = serializers.IntegerField(allow_null=True, required=False)


class DataExportSerializer(serializers.Serializer):
    user = UserSerializer()
    member = MemberExportSerializer(allow_null=True)
    profile_photo = ProfilePhotoExportSerializer(allow_null=True, required=False)
    licenses = LicenseExportSerializer(many=True)
    license_history = serializers.ListSerializer(
        child=serializers.DictField(), required=False
    )
    grade_history = serializers.ListSerializer(
        child=serializers.DictField(), required=False
    )


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField()

    def validate(self, attrs):
        request = self.context.get("request")
        login_name = str(attrs.get("username") or "").strip()
        password = attrs.get("password")
        user = authenticate(request, username=login_name, password=password)
        if user is None and "@" in login_name:
            matched = User.objects.filter(email__iexact=login_name).only("username").first()
            if matched is not None:
                user = authenticate(request, username=matched.username, password=password)
        if not user:
            raise serializers.ValidationError("Invalid credentials")
        if not user.is_active:
            raise serializers.ValidationError("Invalid credentials")
        is_verified = user.is_superuser or user.is_email_verified or EmailAddress.objects.filter(
            user=user, verified=True
        ).exists()
        if not is_verified:
            raise serializers.ValidationError("Email address not verified")
        attrs["user"] = user
        return attrs


class ConsentSerializer(serializers.Serializer):
    consent_given = serializers.BooleanField()


class ResendVerificationSerializer(serializers.Serializer):
    email = serializers.EmailField()
    locale = serializers.CharField(required=False)


class VerifyEmailSerializer(serializers.Serializer):
    key = serializers.CharField()


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()
    locale = serializers.CharField(required=False)


class PasswordResetConfirmSerializer(serializers.Serializer):
    uid = serializers.CharField()
    token = serializers.CharField()
    password = serializers.CharField()

    def validate_password(self, value):
        validate_password(value)
        return value
