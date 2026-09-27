from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views
from .billing import (
    ClubBillingAssignFeeView,
    ClubBillingConfirmView,
    ClubBillingPrintPackView,
    ClubBillingView,
)
from .subsidy_views import (
    ExtraordinarySubsidyDetailView,
    ExtraordinarySubsidyPdfView,
    ExtraordinarySubsidyView,
    SubsidyCoachView,
    SubsidyDiplomaView,
    SubsidyDossierView,
    SubsidyRibView,
    SubsidyTrainersListPdfView,
    SubsidyTrainingListPdfView,
    SubsidyYouthCsvView,
    SubsidyYouthIdView,
    SubsidyYouthXlsxView,
)
from .promotion_views import (
    BeltTestDetailView,
    BeltTestResultView,
    BeltTestView,
    PromotionRuleDetailView,
    PromotionRuleView,
)
from .training_views import (
    TrainingAttendanceView,
    TrainingGenerateView,
    TrainingHolidayDetailView,
    TrainingHolidayView,
    TrainingPayView,
    TrainingSeriesDetailView,
    TrainingSeriesView,
    TrainingSessionDetailView,
    TrainingSessionView,
)
from .shop_views import (
    ShopCataloguePdfView,
    ShopItemViewSet,
    ShopOverviewView,
    ShopSaleViewSet,
    ShopScanView,
    ShopSnapshotViewSet,
)

router = DefaultRouter()
router.register(r"records", views.MemberRecordViewSet, basename="clubmgmt-record")
router.register(r"people", views.PersonViewSet, basename="clubmgmt-person")
router.register(r"contacts", views.MemberContactViewSet, basename="clubmgmt-contact")
router.register(r"checkups", views.MedicalCheckupViewSet, basename="clubmgmt-checkup")
router.register(r"families", views.FamilyViewSet, basename="clubmgmt-family")
router.register(r"rebate-rules", views.FamilyRebateRuleViewSet, basename="clubmgmt-rebate")
router.register(r"membership-fees", views.MembershipFeeViewSet, basename="clubmgmt-fee")
router.register(r"committees", views.CommitteeViewSet, basename="clubmgmt-committee")
router.register(r"mandates", views.CommitteeMandateViewSet, basename="clubmgmt-mandate")
router.register(r"shop/items", ShopItemViewSet, basename="clubmgmt-shop-item")
router.register(r"shop/sales", ShopSaleViewSet, basename="clubmgmt-shop-sale")
router.register(r"shop/snapshots", ShopSnapshotViewSet, basename="clubmgmt-shop-snapshot")

urlpatterns = [
    path("addresses/", views.LuxembourgAddressView.as_view(), name="clubmgmt-addresses"),
    path("finance-access/", views.ClubFinanceAccessView.as_view(), name="clubmgmt-finance-access"),
    path("billing/", ClubBillingView.as_view(), name="clubmgmt-billing"),
    path("billing/confirm/", ClubBillingConfirmView.as_view(), name="clubmgmt-billing-confirm"),
    path("billing/print-pack/", ClubBillingPrintPackView.as_view(), name="clubmgmt-billing-print-pack"),
    path("billing/assign-fee/", ClubBillingAssignFeeView.as_view(), name="clubmgmt-billing-assign-fee"),
    path("shop/overview/", ShopOverviewView.as_view(), name="clubmgmt-shop-overview"),
    path("shop/scan/", ShopScanView.as_view(), name="clubmgmt-shop-scan"),
    path("shop/catalogue.pdf", ShopCataloguePdfView.as_view(), name="clubmgmt-shop-catalogue"),
    path("subsidies/", SubsidyDossierView.as_view(), name="clubmgmt-subsidies"),
    path("subsidies/rib/", SubsidyRibView.as_view(), name="clubmgmt-subsidy-rib"),
    path("subsidies/coaches/", SubsidyCoachView.as_view(), name="clubmgmt-subsidy-coaches"),
    path("subsidies/coaches/<int:user_id>/diploma/", SubsidyDiplomaView.as_view(), name="clubmgmt-subsidy-diploma"),
    path("subsidies/youth-id/", SubsidyYouthIdView.as_view(), name="clubmgmt-subsidy-youth"),
    path("subsidies/youth.csv", SubsidyYouthCsvView.as_view(), name="clubmgmt-subsidy-youth-csv"),
    path("subsidies/youth.xlsx", SubsidyYouthXlsxView.as_view(), name="clubmgmt-subsidy-youth-xlsx"),
    path("subsidies/trainers.pdf", SubsidyTrainersListPdfView.as_view(), name="clubmgmt-subsidy-trainers-pdf"),
    path("subsidies/trainings.pdf", SubsidyTrainingListPdfView.as_view(), name="clubmgmt-subsidy-trainings-pdf"),
    path("subsidies/cases/", ExtraordinarySubsidyView.as_view(), name="clubmgmt-subsidy-cases"),
    path("subsidies/cases/<int:case_id>/", ExtraordinarySubsidyDetailView.as_view(), name="clubmgmt-subsidy-case"),
    path("subsidies/cases/<int:case_id>/form.pdf", ExtraordinarySubsidyPdfView.as_view(), name="clubmgmt-subsidy-pdf"),
    path("training/series/", TrainingSeriesView.as_view(), name="clubmgmt-training-series"),
    path("training/series/<int:series_id>/", TrainingSeriesDetailView.as_view(), name="clubmgmt-training-series-detail"),
    path("training/series/<int:series_id>/generate/", TrainingGenerateView.as_view(), name="clubmgmt-training-generate"),
    path("training/sessions/", TrainingSessionView.as_view(), name="clubmgmt-training-sessions"),
    path("training/sessions/<int:session_id>/", TrainingSessionDetailView.as_view(), name="clubmgmt-training-session"),
    path("training/sessions/<int:session_id>/attendance/", TrainingAttendanceView.as_view(), name="clubmgmt-training-attendance"),
    path("training/holidays/", TrainingHolidayView.as_view(), name="clubmgmt-training-holidays"),
    path("training/holidays/<int:holiday_id>/", TrainingHolidayDetailView.as_view(), name="clubmgmt-training-holiday"),
    path("training/coach-hours/", TrainingPayView.as_view(), name="clubmgmt-training-hours"),
    path("training/promotion/rules/", PromotionRuleView.as_view(), name="clubmgmt-promotion-rules"),
    path("training/promotion/rules/<int:rule_id>/", PromotionRuleDetailView.as_view(), name="clubmgmt-promotion-rule"),
    path("training/promotion/tests/", BeltTestView.as_view(), name="clubmgmt-belt-tests"),
    path("training/promotion/tests/<int:test_id>/", BeltTestDetailView.as_view(), name="clubmgmt-belt-test"),
    path("training/promotion/tests/<int:test_id>/result/", BeltTestResultView.as_view(), name="clubmgmt-belt-test-result"),
    path("", include(router.urls)),
]
