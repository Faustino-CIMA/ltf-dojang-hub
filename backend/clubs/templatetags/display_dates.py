from django import template

from clubs.display_dates import format_display_date, format_display_datetime

register = template.Library()


@register.filter(name="display_date")
def display_date(value):
    return format_display_date(value)


@register.filter(name="display_datetime")
def display_datetime(value):
    return format_display_datetime(value)
