from django.urls import path

from . import views

urlpatterns = [
    path("", views.ModuleStatusView.as_view(), name="modules-status"),
    path("preview/", views.PreviewModuleView.as_view(), name="modules-preview"),
]
