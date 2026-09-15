from django.contrib import admin

from .models import Event


@admin.register(Event)
class EventAdmin(admin.ModelAdmin):
    list_display = ("title", "kind", "owner_scope", "club", "starts_at", "visibility")
    list_filter = ("kind", "owner_scope", "visibility")
    search_fields = ("title", "venue_name")
