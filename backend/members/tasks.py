from celery import shared_task
from django.core.files.base import ContentFile
from django.utils import timezone

from .club_data_export import build_pdf, export_tables, masked_numbers, member_refs, member_rows
from .club_data_import import parse_upload, review_upload
from .club_data_import_commit import apply_decisions
from .models import ClubDataExportJob, ClubDataImportBatch


@shared_task
def build_club_data_pdf(job_id: int) -> None:
    job = ClubDataExportJob.objects.select_related("club").filter(pk=job_id).first()
    if job is None:
        return
    job.status = ClubDataExportJob.Status.RUNNING
    job.progress = 15
    job.save(update_fields=["status", "progress"])
    try:
        sheets = set(job.sheets or [])
        tables = export_tables(
            job.club_id,
            include_members="members" in sheets,
            include_licences="licences" in sheets,
            include_grades="grades" in sheets,
            include_emails="emails" in sheets,
            include_contacts="contacts" in sheets,
            include_families="families" in sheets,
        )
        job.progress = 55
        job.save(update_fields=["progress"])
        refs = member_refs(job.club_id)
        names = {
            row["member_ref"]: f"{row['last_name']} {row['first_name']}".strip()
            for _member_id, row in member_rows(job.club_id)
        }
        payload = build_pdf(tables, job.club.name, job.locale, masked_numbers(job.club_id, refs), names)
        if not payload:
            raise RuntimeError("The report could not be prepared.")
        job.artifact.save(f"club-data-{job.id}.pdf", ContentFile(payload), save=False)
        job.status = ClubDataExportJob.Status.SUCCEEDED
        job.progress = 100
        job.finished_at = timezone.now()
        job.save(update_fields=["artifact", "status", "progress", "finished_at"])
    except Exception as exc:
        job.status = ClubDataExportJob.Status.FAILED
        job.error_detail = str(exc)[:240]
        job.finished_at = timezone.now()
        job.save(update_fields=["status", "error_detail", "finished_at"])


@shared_task
def commit_club_data_import(batch_id: int) -> None:
    batch = ClubDataImportBatch.objects.select_related("upload", "club").filter(pk=batch_id).first()
    if batch is None or batch.status == ClubDataImportBatch.Status.SUCCEEDED:
        return
    try:
        payload = batch.upload.stored.read()
        parsed = parse_upload(payload, batch.upload.file_format)
        report, decisions = review_upload(parsed, batch.club_id, batch.mapping or {}, batch.actions or {})
        if report["counts"]["error"] or (report["counts"]["create"] + report["counts"]["update"]) < 1:
            batch.status = ClubDataImportBatch.Status.FAILED
            batch.error_detail = "The file still has errors."
            batch.finished_at = timezone.now()
            batch.save(update_fields=["status", "error_detail", "finished_at"])
            return
        apply_decisions(batch.club_id, decisions, batch)
    except Exception as exc:
        batch.status = ClubDataImportBatch.Status.FAILED
        batch.error_detail = str(exc)[:240]
        batch.finished_at = timezone.now()
        batch.save(update_fields=["status", "error_detail", "finished_at"])
    finally:
        batch.upload.stored.close()
