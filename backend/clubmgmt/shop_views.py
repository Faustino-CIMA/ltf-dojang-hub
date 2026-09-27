from __future__ import annotations

from django.db.models import Q
from django.http import HttpResponse
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from clubs.models import Club
from members.models import Member

from .models import ShopItem, ShopMovement, ShopSale, ShopSnapshot
from .serializers import ShopItemSerializer, ShopSaleSerializer, ShopSnapshotSerializer
from .shop import (
    complete_sale,
    ensure_default_variant,
    mark_sale_paid,
    move_stock,
    next_sku,
    parse_scan,
    render_catalogue_pdf,
    render_snapshot_pdf,
    render_stickers_pdf,
    shop_summary,
    take_snapshot,
)
from .views import ClubMgmtPermission, _club_id, _require_club


class ShopItemViewSet(viewsets.ModelViewSet):
    serializer_class = ShopItemSerializer
    permission_classes = [ClubMgmtPermission]
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    http_method_names = ["get", "post", "put", "patch", "head", "options"]

    def get_queryset(self):
        qs = ShopItem.objects.prefetch_related("variants")
        club_id = _club_id(self.request)
        if club_id:
            qs = qs.filter(club_id=club_id)
        if self.request.query_params.get("active") == "1":
            qs = qs.filter(is_active=True)
        search = (self.request.query_params.get("q") or "").strip()
        if search:
            qs = qs.filter(Q(name__icontains=search) | Q(sku__icontains=search) | Q(description__icontains=search))
        return qs.order_by("name", "id")

    def perform_create(self, serializer):
        club_id = _require_club(self.request)
        serializer.save(club_id=club_id, sku=next_sku(Club.objects.get(pk=club_id)))

    def perform_update(self, serializer):
        _require_club(self.request)
        serializer.save()

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx["include_qr"] = self.action in {
            "retrieve",
            "create",
            "update",
            "partial_update",
            "receive",
        }
        return ctx

    @action(detail=True, methods=["post"], url_path="receive")
    def receive(self, request, pk=None):
        item = self.get_object()
        _require_club(request)
        note = str(request.data.get("note") or "")
        raw_lines = request.data.get("lines")
        if isinstance(raw_lines, list) and raw_lines:
            lines = raw_lines
        else:
            lines = [{"variant": request.data.get("variant"), "quantity": request.data.get("quantity")}]
        applied = 0
        for line in lines:
            if not isinstance(line, dict):
                continue
            variant_id = line.get("variant")
            variant = item.variants.filter(pk=variant_id).first() if variant_id else None
            if variant is None and len(lines) == 1:
                variant = ensure_default_variant(item)
            if variant is None:
                continue
            try:
                quantity = int(line.get("quantity") or 0)
            except (TypeError, ValueError) as error:
                raise ValidationError({"quantity": "Enter a whole number."}) from error
            if quantity == 0:
                continue
            move_stock(
                variant,
                kind=ShopMovement.Kind.RECEIVE if quantity > 0 else ShopMovement.Kind.ADJUST,
                delta=quantity,
                note=note,
                actor=request.user,
            )
            applied += 1
        if applied == 0:
            raise ValidationError({"quantity": "Enter how many arrived."})
        item.refresh_from_db()
        return Response(ShopItemSerializer(item, context=self.get_serializer_context()).data)

    @action(detail=True, methods=["get"], url_path="stickers")
    def stickers(self, request, pk=None):
        item = self.get_object()
        try:
            copies = int(request.query_params.get("copies") or 1)
        except (TypeError, ValueError):
            copies = 1
        if str(request.query_params.get("all") or "") in {"1", "true"}:
            variants = list(item.variants.filter(is_active=True).order_by("id"))
            variant = None
        else:
            variant_id = request.query_params.get("variant")
            variant = item.variants.filter(pk=variant_id).first() if variant_id else None
            variants = None
        try:
            start_slot = int(request.query_params.get("start") or 1)
        except (TypeError, ValueError):
            start_slot = 1
        x_offset_mm, y_offset_mm = "0.00", "0.00"
        printer_profile_id = request.query_params.get("printer_profile")
        if printer_profile_id:
            from licenses.models import PrinterProfile

            printer = PrinterProfile.objects.filter(
                pk=printer_profile_id, created_by=request.user
            ).first()
            if printer is None:
                raise ValidationError({"printer_profile": "Printer profile not found."})
            x_offset_mm = printer.x_offset_mm
            y_offset_mm = printer.y_offset_mm
        pdf = render_stickers_pdf(
            item,
            copies=copies,
            variant=variant,
            variants=variants,
            start_slot=start_slot,
            x_offset_mm=x_offset_mm,
            y_offset_mm=y_offset_mm,
            base_url=request.build_absolute_uri("/"),
        )
        if not pdf:
            return Response({"detail": "PDF generation is not available."}, status=500)
        response = HttpResponse(pdf, content_type="application/pdf")
        response["Content-Disposition"] = f'inline; filename="{item.sku}_stickers.pdf"'
        return response


class ShopSaleViewSet(viewsets.ModelViewSet):
    serializer_class = ShopSaleSerializer
    permission_classes = [ClubMgmtPermission]
    http_method_names = ["get", "post", "head", "options"]

    def get_queryset(self):
        qs = ShopSale.objects.select_related("member").prefetch_related("lines")
        club_id = _club_id(self.request)
        if club_id:
            qs = qs.filter(club_id=club_id)
        status_param = self.request.query_params.get("status")
        if status_param:
            qs = qs.filter(status=status_param)
        return qs

    def create(self, request, *args, **kwargs):
        club_id = _require_club(request)
        club = Club.objects.get(pk=club_id)
        member_id = request.data.get("member")
        member = Member.objects.filter(pk=member_id, club_id=club_id).first() if member_id else None
        sale = complete_sale(
            club=club,
            member=member,
            walk_in_name=str(request.data.get("walk_in_name") or ""),
            lines=request.data.get("lines") or [],
            payment_method=str(request.data.get("payment_method") or "cash"),
            actor=request.user,
        )
        return Response(
            ShopSaleSerializer(sale, context=self.get_serializer_context()).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["post"], url_path="mark-paid")
    def mark_paid(self, request, pk=None):
        sale = self.get_object()
        _require_club(request)
        sale = mark_sale_paid(
            sale,
            payment_method=str(request.data.get("payment_method") or "cash"),
            actor=request.user,
        )
        return Response(ShopSaleSerializer(sale, context=self.get_serializer_context()).data)


class ShopSnapshotViewSet(viewsets.ModelViewSet):
    serializer_class = ShopSnapshotSerializer
    permission_classes = [ClubMgmtPermission]
    http_method_names = ["get", "post", "head", "options"]

    def get_queryset(self):
        qs = ShopSnapshot.objects.prefetch_related("lines")
        club_id = _club_id(self.request)
        if club_id:
            qs = qs.filter(club_id=club_id)
        return qs

    def create(self, request, *args, **kwargs):
        club_id = _require_club(request)
        snapshot = take_snapshot(
            club=Club.objects.get(pk=club_id),
            note=str(request.data.get("note") or ""),
            actor=request.user,
        )
        return Response(
            ShopSnapshotSerializer(snapshot, context=self.get_serializer_context()).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["get"], url_path="pdf")
    def pdf(self, request, pk=None):
        snapshot = self.get_object()
        pdf = render_snapshot_pdf(snapshot, base_url=request.build_absolute_uri("/"))
        if not pdf:
            return Response({"detail": "PDF generation is not available."}, status=500)
        response = HttpResponse(pdf, content_type="application/pdf")
        response["Content-Disposition"] = f'inline; filename="stock_{snapshot.id}.pdf"'
        return response


class ShopOverviewView(APIView):
    permission_classes = [ClubMgmtPermission]

    def get(self, request):
        club_id = _require_club(request)
        return Response(shop_summary(Club.objects.get(pk=club_id)))


class ShopScanView(APIView):
    permission_classes = [ClubMgmtPermission]

    def get(self, request):
        _require_club(request)
        variant = parse_scan(str(request.query_params.get("code") or ""))
        if variant is None or variant.item.club_id != _club_id(request):
            return Response({"detail": "No item matches that code."}, status=404)
        return Response(
            {
                "variant_id": variant.id,
                "item_id": variant.item_id,
                "sku": variant.item.sku,
                "name": variant.item.name,
                "label": variant.label,
                "sale_price": str(variant.resolved_sale_price()),
                "quantity": variant.quantity,
                "photo_url": request.build_absolute_uri(variant.item.photo.url) if variant.item.photo else "",
            }
        )


class ShopCataloguePdfView(APIView):
    permission_classes = [ClubMgmtPermission]

    def get(self, request):
        club_id = _require_club(request)
        pdf = render_catalogue_pdf(Club.objects.get(pk=club_id), base_url=request.build_absolute_uri("/"))
        if not pdf:
            return Response({"detail": "PDF generation is not available."}, status=500)
        response = HttpResponse(pdf, content_type="application/pdf")
        response["Content-Disposition"] = 'inline; filename="shop_catalogue.pdf"'
        return response
