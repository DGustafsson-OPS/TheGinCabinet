"""CSV import and data export (spec §6 "Imports and export", §11).

Import works in two steps, like a spreadsheet "preview":

1. ``POST /admin/import/gins`` (``dry_run=true`` is the default): the file is
   processed completely inside a database transaction that is then *rolled
   back*, so nothing is saved, and you get a report of what would happen.
2. The same call with ``?dry_run=false`` runs the identical code and commits.

Using the same code for both guarantees the preview matches the real import.
"""

import csv
import io
import json
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, File, Query, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, ValidationError
from sqlalchemy import func, select

from app.api.deps import CurrentAdmin, CurrentAdminWrite, DbSession
from app.errors import ApiError
from app.models import Bottle, Distillery, GinProduct, Purchase, WishlistItem
from app.schemas.catalogue import DistilleryOut, GinIn
from app.schemas.inventory import BottleDetailOut, WishlistOut
from app.services import audit
from app.services.catalogue import create_gin, find_duplicate, gin_out
from app.services.common import slugify, unique_slug
from app.services.inventory import purchase_out

router = APIRouter(prefix="/admin", tags=["admin: import & export"])

MAX_UPLOAD_BYTES = 1_000_000  # 1 MB is thousands of gins
GIN_COLUMNS = [
    "brand",
    "name",
    "edition",
    "style",
    "abv",
    "country",
    "distillery",
    "botanicals",
    "public_visible",
    "description",
]
# Botanicals share one cell, separated by "|" (commas/semicolons separate columns).
BOTANICAL_SEPARATOR = "|"


class ImportRow(BaseModel):
    row: int  # spreadsheet row number: the header is row 1
    name: str


class ImportIssue(ImportRow):
    reasons: list[str]


class ImportResult(BaseModel):
    dry_run: bool
    total_rows: int
    created: list[ImportRow]
    duplicates: list[ImportIssue]
    rejected: list[ImportIssue]
    new_distilleries: list[str]


def _read_csv(raw: bytes) -> list[dict[str, str]]:
    # "utf-8-sig" also strips the invisible marker Excel adds at the start.
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise ApiError(422, "invalid_encoding", "Save the CSV as UTF-8 and try again.") from exc
    # Swedish/European Excel uses ";" between columns; detect which one is used.
    first_line = text.split("\n", 1)[0]
    delimiter = ";" if first_line.count(";") > first_line.count(",") else ","
    reader = csv.DictReader(io.StringIO(text), delimiter=delimiter)
    headers = {h.strip().lower() for h in reader.fieldnames or []}
    missing = {"brand", "name", "abv"} - headers
    if missing:
        raise ApiError(
            422,
            "missing_columns",
            "The CSV is missing required columns.",
            details={"missing": sorted(missing), "expected": GIN_COLUMNS},
        )
    # Normalise header names and trim every cell.
    return [
        {(k or "").strip().lower(): (v or "").strip() for k, v in row.items()} for row in reader
    ]


def _to_bool(value: str) -> bool:
    return value.strip().lower() in {"1", "true", "yes", "y", "ja", "x"}


@router.post("/import/gins", response_model=ImportResult)
def import_gins(
    admin: CurrentAdminWrite,
    db: DbSession,
    file: Annotated[UploadFile, File(description="CSV with columns: " + ", ".join(GIN_COLUMNS))],
    dry_run: Annotated[bool, Query(description="Preview only; nothing is saved")] = True,
):
    raw = file.file.read(MAX_UPLOAD_BYTES + 1)
    if len(raw) > MAX_UPLOAD_BYTES:
        raise ApiError(413, "file_too_large", "The file is larger than 1 MB.")
    rows = _read_csv(raw)

    result = ImportResult(
        dry_run=dry_run,
        total_rows=len(rows),
        created=[],
        duplicates=[],
        rejected=[],
        new_distilleries=[],
    )
    seen_in_file: dict[tuple[str, str, str], int] = {}

    for number, row in enumerate(rows, start=2):
        label = " ".join(p for p in (row.get("brand"), row.get("name"), row.get("edition")) if p)
        label = label or "(empty row)"
        candidate = {
            "brand": row.get("brand", ""),
            "name": row.get("name", ""),
            "edition": row.get("edition", ""),
            "style": (row.get("style") or "other").lower().replace(" ", "_"),
            "abv": row.get("abv", "").replace(",", ".").rstrip("%").strip(),
            "country": row.get("country") or None,
            "description": row.get("description") or None,
            "public_visible": _to_bool(row.get("public_visible", "")),
            "botanicals": [b for b in row.get("botanicals", "").split(BOTANICAL_SEPARATOR) if b],
        }
        # Reuse the API's own validation rules: one source of truth.
        try:
            gin_in = GinIn.model_validate(candidate)
        except ValidationError as exc:
            reasons = [f"{'.'.join(map(str, e['loc']))}: {e['msg']}" for e in exc.errors()]
            result.rejected.append(ImportIssue(row=number, name=label, reasons=reasons))
            continue

        key = (gin_in.brand.lower(), gin_in.name.lower(), gin_in.edition.lower())
        if key in seen_in_file:
            result.duplicates.append(
                ImportIssue(
                    row=number, name=label, reasons=[f"Same gin as row {seen_in_file[key]}"]
                )
            )
            continue
        seen_in_file[key] = number
        existing = find_duplicate(db, gin_in.brand, gin_in.name, gin_in.edition)
        if existing:
            result.duplicates.append(
                ImportIssue(
                    row=number,
                    name=label,
                    reasons=[f"Already in the catalogue as {existing.display_name}"],
                )
            )
            continue

        data = gin_in.model_dump()
        distillery_name = row.get("distillery", "")
        if distillery_name:
            distillery = db.scalar(
                select(Distillery).where(func.lower(Distillery.name) == distillery_name.lower())
            )
            if distillery is None:
                distillery = Distillery(
                    name=distillery_name,
                    slug=unique_slug(db, Distillery, slugify(distillery_name)),
                    country=gin_in.country,
                )
                db.add(distillery)
                db.flush()
                result.new_distilleries.append(distillery_name)
            data["distillery_id"] = distillery.id
        create_gin(db, data)
        db.flush()  # so later rows see this gin when checking for duplicates
        result.created.append(ImportRow(row=number, name=label))

    if dry_run:
        db.rollback()  # undo everything: it was only a preview
    else:
        audit.record(
            db,
            action="import.gins",
            entity_type="gin",
            actor_id=admin.user.id,
            summary={
                "file": file.filename,
                "created": len(result.created),
                "duplicates": len(result.duplicates),
                "rejected": len(result.rejected),
            },
        )
        db.commit()
    return result


def _safe_cell(value) -> str:
    """Stop "CSV injection": a cell starting with = + - @ could run as a formula
    when the file is opened in Excel, so we prefix it with an apostrophe."""
    text = "" if value is None else str(value)
    return "'" + text if text[:1] in ("=", "+", "-", "@") else text


@router.get("/export/gins.csv")
def export_gins_csv(admin: CurrentAdmin, db: DbSession):
    """The catalogue as CSV, in the same format the importer reads."""
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(GIN_COLUMNS)
    for gin in db.scalars(select(GinProduct).order_by(GinProduct.brand, GinProduct.name)):
        writer.writerow(
            _safe_cell(v)
            for v in (
                gin.brand,
                gin.name,
                gin.edition,
                gin.style,
                gin.abv,
                gin.country,
                gin.distillery.name if gin.distillery else "",
                BOTANICAL_SEPARATOR.join(b.name for b in gin.botanicals),
                "yes" if gin.public_visible else "no",
                gin.description,
            )
        )
    audit.record(db, action="export.gins_csv", entity_type="gin", actor_id=admin.user.id)
    db.commit()
    return Response(
        content=output.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="gin-cabinet-gins.csv"'},
    )


@router.get("/export")
def export_all(admin: CurrentAdmin, db: DbSession):
    """Everything in Phase 2 as one JSON file (spec §6 "data export").

    Tastings, reviews and recipes join this export when those phases are built.
    """
    data = {
        "format": "gin-cabinet-export",
        "version": 1,
        "exported_at": datetime.now(UTC).isoformat(),
        "distilleries": [DistilleryOut.model_validate(d) for d in db.scalars(select(Distillery))],
        "gins": [gin_out(g) for g in db.scalars(select(GinProduct))],
        "purchases": [purchase_out(p) for p in db.scalars(select(Purchase))],
        "bottles": [BottleDetailOut.model_validate(b) for b in db.scalars(select(Bottle))],
        "wishlist": [WishlistOut.model_validate(w) for w in db.scalars(select(WishlistItem))],
    }
    audit.record(db, action="export.full", entity_type="collection", actor_id=admin.user.id)
    db.commit()
    body = {
        key: [item.model_dump(mode="json") for item in value] if isinstance(value, list) else value
        for key, value in data.items()
    }
    return Response(
        content=json.dumps(body, indent=2, ensure_ascii=False),
        media_type="application/json",
        headers={"Content-Disposition": 'attachment; filename="gin-cabinet-export.json"'},
    )
