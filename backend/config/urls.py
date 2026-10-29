from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path
from django.views.generic.base import RedirectView
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView
from rest_framework.routers import DefaultRouter

from accounts.views import (
    AccountSetupView,
    ConsentView,
    DataDeleteView,
    DataExportView,
    LoginView,
    LogoutView,
    MeView,
    PasswordResetConfirmView,
    PasswordResetRequestView,
    ResendStatusView,
    ResendVerificationView,
    VerifyEmailView,
)
from licenses.module_renewals import ModuleRenewalLinkView
from ops.views import PublicI18nView
from config.views import root_entry
from imports.views import (
    ClubImportConfirmView,
    ClubImportPreviewView,
    MemberImportConfirmView,
    MemberImportPreviewView,
)
from members.parked_views import (
    ParkedMemberBulkAssignView,
    ParkedMemberBulkDeleteView,
    ParkedMemberDeleteView,
    ParkedMemberListView,
    ParkedMemberResolveView,
)
from clubs.access_links import ClubAdminAccessLinkView, ClubAdminAccessLinksCsvView
from clubs.public_stats import PublicStatsView
from setup.views import (
    SetupAdminLinkView,
    SetupAdminLinksCsvView,
    SetupAdminsConfirmView,
    SetupAdminsListView,
    SetupAdminsPreviewView,
    SetupClubsConfirmView,
    SetupClubsPreviewView,
    SetupFinishView,
    SetupMembersConfirmView,
    SetupMembersPreviewView,
    SetupStartView,
    SetupStatusView,
)
from clubs.venue_views import (
    LuxembourgAddressLookupView,
    TrainingVenueDetailView,
    TrainingVenueListCreateView,
)
from clubs.views import (
    ClubViewSet,
    FederationProfileLogoContentView,
    FederationProfileLogoDetailView,
    FederationProfileLogoListView,
    FederationProfileView,
)
from licenses.bank_recon import (
    ClubBankStatementViewSet,
    ClubFinanceBudgetView,
    FederationBankStatementViewSet,
    FederationFinanceBudgetView,
)
from licenses.club_books import (
    ClubExpenseCategoryViewSet,
    ClubExpenseViewSet,
    ClubFinanceReportExportView,
    ClubFinanceReportView,
    ClubFinanceYearOpeningView,
    ClubIncomeCategoryViewSet,
    ClubIncomeViewSet,
    ClubStatementView,
)
from licenses.bundle_catalog import ModuleBundleViewSet, ModuleSubscriptionSettingsView
from licenses.views import (
    ClubInvoiceViewSet,
    ClubPaymentViewSet,
    ClubOrderViewSet,
    FinanceAuditLogViewSet,
    InvoiceViewSet,
    ExpenseCategoryViewSet,
    ExpenseViewSet,
    IncomeCategoryViewSet,
    IncomeViewSet,
    FinanceReportExportView,
    FinanceReportView,
    FinanceYearOpeningView,
    InvoicePdfView,
    ClubFeeBillingScheduleViewSet,
    ClubFeeBillingView,
    ClubFeePriceViewSet,
    ClubFeeTypeViewSet,
    LicensePriceViewSet,
    LicenseTypeViewSet,
    LicenseViewSet,
    LtfAdminOverviewView,
    LtfFinanceOverviewView,
    OrderViewSet,
    PayconiqPaymentViewSet,
    PaymentViewSet,
    StripeConfirmCheckoutView,
    StripeWebhookView,
)
from licenses.card_views import (
    CardFormatPresetViewSet,
    CardFontAssetViewSet,
    CardImageAssetViewSet,
    CardDesignerClubsLookupView,
    CardDesignerLicensesLookupView,
    CardDesignerMembersLookupView,
    CardTemplateViewSet,
    CardTemplateVersionViewSet,
    MergeFieldRegistryView,
    PaperProfileViewSet,
    PrinterProfileViewSet,
    PrintJobViewSet,
)
from members.transfer_views import MemberTransferViewSet
from events.views import EventViewSet
from members.views import MemberViewSet, RewriteLtfLicensePrefixView
from nationalteam.views import (
    AthleteNationalTeamBadgeView,
    AthleteNationalTeamView,
    AthleteStatusViewSet,
    CadreLevelViewSet,
    NationalTeamSettingsView,
    SeasonViewSet,
    SelectionViewSet,
    SquadViewSet,
    StaffViewSet,
)

router = DefaultRouter()
router.register(r"clubs", ClubViewSet, basename="club")
router.register(r"events", EventViewSet, basename="event")
router.register(r"members", MemberViewSet, basename="member")
router.register(r"member-transfers", MemberTransferViewSet, basename="member-transfer")
router.register(r"licenses", LicenseViewSet, basename="license")
router.register(r"license-types", LicenseTypeViewSet, basename="license-type")
router.register(r"license-prices", LicensePriceViewSet, basename="license-price")
router.register(r"club-fee-types", ClubFeeTypeViewSet, basename="club-fee-type")
router.register(r"module-bundles", ModuleBundleViewSet, basename="module-bundle")
router.register(r"club-fee-prices", ClubFeePriceViewSet, basename="club-fee-price")
router.register(
    r"club-fee-billing-schedules",
    ClubFeeBillingScheduleViewSet,
    basename="club-fee-billing-schedule",
)
router.register(r"orders", OrderViewSet, basename="order")
router.register(r"invoices", InvoiceViewSet, basename="invoice")
router.register(r"payments", PaymentViewSet, basename="payment")
router.register(r"payconiq", PayconiqPaymentViewSet, basename="payconiq")
router.register(r"club-orders", ClubOrderViewSet, basename="club-order")
router.register(r"club-invoices", ClubInvoiceViewSet, basename="club-invoice")
router.register(r"club-payments", ClubPaymentViewSet, basename="club-payment")
router.register(r"club-expenses", ClubExpenseViewSet, basename="club-expense")
router.register(r"club-incomes", ClubIncomeViewSet, basename="club-income")
router.register(r"club-expense-categories", ClubExpenseCategoryViewSet, basename="club-expense-category")
router.register(r"club-income-categories", ClubIncomeCategoryViewSet, basename="club-income-category")
router.register(r"club-bank-statements", ClubBankStatementViewSet, basename="club-bank-statement")
router.register(r"bank-statements", FederationBankStatementViewSet, basename="bank-statement")
router.register(r"finance-audit-logs", FinanceAuditLogViewSet, basename="finance-audit-log")
router.register(r"expense-categories", ExpenseCategoryViewSet, basename="expense-category")
router.register(r"expenses", ExpenseViewSet, basename="expense")
router.register(r"income-categories", IncomeCategoryViewSet, basename="income-category")
router.register(r"incomes", IncomeViewSet, basename="income")
router.register(r"card-formats", CardFormatPresetViewSet, basename="card-format")
router.register(r"card-font-assets", CardFontAssetViewSet, basename="card-font-asset")
router.register(r"card-image-assets", CardImageAssetViewSet, basename="card-image-asset")
router.register(r"paper-profiles", PaperProfileViewSet, basename="paper-profile")
router.register(r"printer-profiles", PrinterProfileViewSet, basename="printer-profile")
router.register(r"card-templates", CardTemplateViewSet, basename="card-template")
router.register(
    r"card-template-versions",
    CardTemplateVersionViewSet,
    basename="card-template-version",
)
router.register(r"print-jobs", PrintJobViewSet, basename="print-job")
router.register(r"national-team/seasons", SeasonViewSet, basename="national-team-season")
router.register(r"national-team/squads", SquadViewSet, basename="national-team-squad")
router.register(r"national-team/levels", CadreLevelViewSet, basename="national-team-level")
router.register(r"national-team/selections", SelectionViewSet, basename="national-team-selection")
router.register(r"national-team/statuses", AthleteStatusViewSet, basename="national-team-status")
router.register(r"national-team/staff", StaffViewSet, basename="national-team-staff")

def health_check(request):
    return JsonResponse({"status": "ok"})


schema_view = (
    SpectacularAPIView.as_view(throttle_classes=[])
    if settings.DEBUG
    else SpectacularAPIView.as_view()
)

handler404 = "config.views.not_found"

urlpatterns = [
    path("", root_entry, name="root"),
    path("favicon.ico", RedirectView.as_view(url="/static/favicon.ico", permanent=True)),
    path("admin/", admin.site.urls),
    path("accounts/", include("allauth.urls")),
    path("api/auth/login/", LoginView.as_view(), name="login"),
    path("api/auth/logout/", LogoutView.as_view(), name="logout"),
    path("api/auth/me/", MeView.as_view(), name="me"),
    path("api/auth/consent/", ConsentView.as_view(), name="consent"),
    path("api/auth/data-export/", DataExportView.as_view(), name="data-export"),
    path("api/auth/data-delete/", DataDeleteView.as_view(), name="data-delete"),
    path(
        "api/auth/resend-verification/",
        ResendVerificationView.as_view(),
        name="resend-verification",
    ),
    path("api/auth/verify-email/", VerifyEmailView.as_view(), name="verify-email"),
    path("api/auth/resend-status/", ResendStatusView.as_view(), name="resend-status"),
    path("api/module-renewals/", ModuleRenewalLinkView.as_view(), name="module-renewals"),
    path("api/auth/account-setup/", AccountSetupView.as_view(), name="account-setup"),
    path("api/auth/password-reset/", PasswordResetRequestView.as_view(), name="password-reset"),
    path(
        "api/auth/password-reset/confirm/",
        PasswordResetConfirmView.as_view(),
        name="password-reset-confirm",
    ),
    path("api/addresses/lu/", LuxembourgAddressLookupView.as_view(), name="lu-address-lookup"),
    path("api/setup/status/", SetupStatusView.as_view(), name="setup-status"),
    path("api/setup/start/", SetupStartView.as_view(), name="setup-start"),
    path("api/setup/clubs/preview/", SetupClubsPreviewView.as_view(), name="setup-clubs-preview"),
    path("api/setup/clubs/confirm/", SetupClubsConfirmView.as_view(), name="setup-clubs-confirm"),
    path("api/setup/members/preview/", SetupMembersPreviewView.as_view(), name="setup-members-preview"),
    path("api/setup/members/confirm/", SetupMembersConfirmView.as_view(), name="setup-members-confirm"),
    path("api/setup/admins/preview/", SetupAdminsPreviewView.as_view(), name="setup-admins-preview"),
    path("api/setup/admins/confirm/", SetupAdminsConfirmView.as_view(), name="setup-admins-confirm"),
    path("api/setup/admins/setup-links.csv", SetupAdminLinksCsvView.as_view(), name="setup-admin-links-csv"),
    path("api/setup/admins/<int:user_id>/setup-link/", SetupAdminLinkView.as_view(), name="setup-admin-link"),
    path("api/setup/admins/", SetupAdminsListView.as_view(), name="setup-admins"),
    path("api/setup/finish/", SetupFinishView.as_view(), name="setup-finish"),
    path(
        "api/clubs/<int:club_id>/training-venues/",
        TrainingVenueListCreateView.as_view(),
        name="club-training-venues",
    ),
    path(
        "api/clubs/<int:club_id>/training-venues/<int:venue_id>/",
        TrainingVenueDetailView.as_view(),
        name="club-training-venue-detail",
    ),
    path("api/imports/clubs/preview/", ClubImportPreviewView.as_view(), name="import-clubs-preview"),
    path("api/imports/clubs/confirm/", ClubImportConfirmView.as_view(), name="import-clubs-confirm"),
    path("api/imports/members/preview/", MemberImportPreviewView.as_view(), name="import-members-preview"),
    path("api/imports/members/confirm/", MemberImportConfirmView.as_view(), name="import-members-confirm"),
    path("api/parked-members/", ParkedMemberListView.as_view(), name="parked-members"),
    path("api/parked-members/bulk-assign/", ParkedMemberBulkAssignView.as_view(), name="parked-members-bulk-assign"),
    path("api/parked-members/bulk-delete/", ParkedMemberBulkDeleteView.as_view(), name="parked-members-bulk-delete"),
    path("api/parked-members/<int:pk>/", ParkedMemberDeleteView.as_view(), name="parked-member-delete"),
    path("api/parked-members/<int:pk>/resolve/", ParkedMemberResolveView.as_view(), name="parked-member-resolve"),
    path("api/federation-profile/", FederationProfileView.as_view(), name="federation-profile"),
    path("api/club-fee-billings/", ClubFeeBillingView.as_view(), name="club-fee-billings"),
    path(
        "api/module-subscription-settings/",
        ModuleSubscriptionSettingsView.as_view(),
        name="module-subscription-settings",
    ),
    path(
        "api/federation-profile/logos/",
        FederationProfileLogoListView.as_view(),
        name="federation-profile-logos",
    ),
    path(
        "api/federation-profile/logos/<int:logo_id>/",
        FederationProfileLogoDetailView.as_view(),
        name="federation-profile-logo-detail",
    ),
    path(
        "api/federation-profile/logos/<int:logo_id>/content/",
        FederationProfileLogoContentView.as_view(),
        name="federation-profile-logo-content",
    ),
    path("api/health/", health_check, name="health-check"),
    path("api/public/stats/", PublicStatsView.as_view(), name="public-stats"),
    path("api/i18n/<str:locale>/", PublicI18nView.as_view(), name="public-i18n"),
    path("api/ops/", include("ops.urls")),
    path("api/modules/", include("modules.urls")),
    path("api/club-management/", include("clubmgmt.urls")),
    path(
        "api/members/ltf-license-prefix-rewrite/",
        RewriteLtfLicensePrefixView.as_view(),
        name="member-ltf-license-prefix-rewrite",
    ),
    path("api/dashboard/overview/ltf-admin/", LtfAdminOverviewView.as_view(), name="overview-ltf-admin"),
    path(
        "api/dashboard/overview/ltf-finance/",
        LtfFinanceOverviewView.as_view(),
        name="overview-ltf-finance",
    ),
    path("api/stripe/webhook/", StripeWebhookView.as_view(), name="stripe-webhook"),
    path(
        "api/stripe/confirm-checkout/",
        StripeConfirmCheckoutView.as_view(),
        name="stripe-confirm-checkout",
    ),
    path("api/invoices/<int:invoice_id>/pdf/", InvoicePdfView.as_view(), name="invoice-pdf"),
    path("api/finance-reports/", FinanceReportView.as_view(), name="finance-report"),
    path("api/finance-reports/export/", FinanceReportExportView.as_view(), name="finance-report-export"),
    path("api/finance-year-openings/", FinanceYearOpeningView.as_view(), name="finance-year-opening"),
    path("api/club-finance-reports/", ClubFinanceReportView.as_view(), name="club-finance-report"),
    path(
        "api/club-finance-reports/export/",
        ClubFinanceReportExportView.as_view(),
        name="club-finance-report-export",
    ),
    path(
        "api/club-finance-year-openings/",
        ClubFinanceYearOpeningView.as_view(),
        name="club-finance-year-opening",
    ),
    path("api/club-statements/", ClubStatementView.as_view(), name="club-statement"),
    path("api/club-finance-budgets/", ClubFinanceBudgetView.as_view(), name="club-finance-budget"),
    path("api/finance-budgets/", FederationFinanceBudgetView.as_view(), name="finance-budget"),
    path("api/merge-fields/", MergeFieldRegistryView.as_view(), name="merge-fields"),
    path(
        "api/card-designer/lookups/members/",
        CardDesignerMembersLookupView.as_view(),
        name="card-designer-lookups-members",
    ),
    path(
        "api/card-designer/lookups/licenses/",
        CardDesignerLicensesLookupView.as_view(),
        name="card-designer-lookups-licenses",
    ),
    path(
        "api/card-designer/lookups/clubs/",
        CardDesignerClubsLookupView.as_view(),
        name="card-designer-lookups-clubs",
    ),
    path("api/national-team/settings/", NationalTeamSettingsView.as_view(), name="national-team-settings"),
    path(
        "api/national-team/athletes/<int:member_id>/badge/",
        AthleteNationalTeamBadgeView.as_view(),
        name="national-team-athlete-badge",
    ),
    path(
        "api/national-team/athletes/<int:member_id>/",
        AthleteNationalTeamView.as_view(),
        name="national-team-athlete",
    ),
    path("api/clubs/admins/<int:user_id>/access-link/", ClubAdminAccessLinkView.as_view(), name="club-admin-access-link"),
    path("api/clubs/admins/access-links/", ClubAdminAccessLinksCsvView.as_view(), name="club-admin-access-links-csv"),
    path("api/", include(router.urls)),
    path("api/schema/", schema_view, name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="docs"),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

