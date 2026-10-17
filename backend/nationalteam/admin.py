from django.contrib import admin

from .models import (
    AthleteStatus,
    CadreLevel,
    NationalTeamSettings,
    NationalTeamStaff,
    Season,
    Squad,
    SquadSelection,
)

admin.site.register(NationalTeamSettings)
admin.site.register(Season)
admin.site.register(Squad)
admin.site.register(CadreLevel)
admin.site.register(SquadSelection)
admin.site.register(AthleteStatus)
admin.site.register(NationalTeamStaff)
