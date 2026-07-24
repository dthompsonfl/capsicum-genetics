#!/usr/bin/env python3
"""Validate and normalize the supplied seed catalog without activating claims.

The importer treats the workbook exports as untrusted staging input. It preserves
source-row provenance and emits draft records only. No executable phenotype rule
is created by this process.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
from pathlib import Path
from typing import Any, Iterable

EXPECTED = {
    "Locus_Catalog.csv": 22,
    "Evidence_Claims.csv": 22,
    "Sources.csv": 30,
}

ID_FIELDS = {
    "Locus_Catalog.csv": "catalog_id",
    "Evidence_Claims.csv": "claim_id",
    "Sources.csv": "source_id",
}

REQUIRED_FIELDS = {
    "Locus_Catalog.csv": {
        "catalog_id",
        "canonical_symbol",
        "trait_category",
        "species_scope",
        "model_class",
        "supported_claim",
        "prohibited_claim",
        "required_context",
        "primary_sources",
    },
    "Evidence_Claims.csv": {
        "claim_id",
        "catalog_id",
        "claim_text",
        "applicability",
        "required_conditions",
        "exclusions",
        "source_ids",
        "review_status",
    },
    "Sources.csv": {
        "source_id",
        "year",
        "title",
        "authors",
        "source_type",
        "url",
        "key_use",
        "limitations",
    },
}


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def split_ids(value: str) -> list[str]:
    return [item.strip() for item in value.split(";") if item.strip()]


def read_csv(path: Path) -> tuple[list[str], list[dict[str, str]]]:
    with path.open(encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream)
        fieldnames = reader.fieldnames or []
        rows = [dict(row) for row in reader]
    return fieldnames, rows


def issue(
    issues: list[dict[str, Any]],
    *,
    file: str,
    code: str,
    message: str,
    row: int | None = None,
    field: str | None = None,
) -> None:
    value: dict[str, Any] = {"file": file, "code": code, "message": message}
    if row is not None:
        value["row"] = row
    if field is not None:
        value["field"] = field
    issues.append(value)


def validate_headers(name: str, fieldnames: Iterable[str], issues: list[dict[str, Any]]) -> None:
    present = set(fieldnames)
    for field in sorted(REQUIRED_FIELDS[name] - present):
        issue(
            issues,
            file=name,
            code="missing_header",
            field=field,
            message=f"Required column {field!r} is absent.",
        )


def validate_rows(
    name: str,
    rows: list[dict[str, str]],
    issues: list[dict[str, Any]],
) -> None:
    identifier_field = ID_FIELDS[name]
    identifiers: set[str] = set()
    for index, row in enumerate(rows, start=2):
        for field in REQUIRED_FIELDS[name]:
            if not (row.get(field) or "").strip():
                issue(
                    issues,
                    file=name,
                    code="missing_required_value",
                    row=index,
                    field=field,
                    message=f"Required value {field!r} is blank.",
                )
        identifier = (row.get(identifier_field) or "").strip()
        if identifier in identifiers:
            issue(
                issues,
                file=name,
                code="duplicate_identifier",
                row=index,
                field=identifier_field,
                message=f"Duplicate identifier {identifier!r}.",
            )
        identifiers.add(identifier)


def validate_references(
    loci: list[dict[str, str]],
    claims: list[dict[str, str]],
    sources: list[dict[str, str]],
    issues: list[dict[str, Any]],
) -> None:
    locus_ids = {row["catalog_id"].strip() for row in loci}
    source_ids = {row["source_id"].strip() for row in sources}

    for row_number, row in enumerate(loci, start=2):
        for source_id in split_ids(row.get("primary_sources", "")):
            if source_id not in source_ids:
                issue(
                    issues,
                    file="Locus_Catalog.csv",
                    code="unknown_source_reference",
                    row=row_number,
                    field="primary_sources",
                    message=f"Source {source_id!r} is not present in Sources.csv.",
                )

    for row_number, row in enumerate(claims, start=2):
        catalog_id = row.get("catalog_id", "").strip()
        if catalog_id not in locus_ids:
            issue(
                issues,
                file="Evidence_Claims.csv",
                code="unknown_locus_reference",
                row=row_number,
                field="catalog_id",
                message=f"Locus {catalog_id!r} is not present in Locus_Catalog.csv.",
            )
        for source_id in split_ids(row.get("source_ids", "")):
            if source_id not in source_ids:
                issue(
                    issues,
                    file="Evidence_Claims.csv",
                    code="unknown_source_reference",
                    row=row_number,
                    field="source_ids",
                    message=f"Source {source_id!r} is not present in Sources.csv.",
                )


def normalize_rows(name: str, file_hash: str, rows: list[dict[str, str]]) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    for row_number, row in enumerate(rows, start=2):
        clean = {key: (value or "").strip() for key, value in row.items()}
        clean["_provenance"] = {
            "sourceFile": name,
            "sourceFileSha256": file_hash,
            "sourceRow": row_number,
            "rawRowSha256": sha256_bytes(canonical_json(row).encode("utf-8")),
            "reviewState": "draft_pending_independent_review",
        }
        normalized.append(clean)
    return normalized


def reconcile(source_dir: Path, normalized_dir: Path | None = None) -> dict[str, Any]:
    files: list[dict[str, Any]] = []
    issues: list[dict[str, Any]] = []
    staged: dict[str, list[dict[str, str]]] = {}
    hashes: dict[str, str] = {}

    for name, expected_count in EXPECTED.items():
        path = source_dir / name
        if not path.is_file():
            issue(
                issues,
                file=name,
                code="missing_file",
                message=f"Expected source file {name!r} does not exist.",
            )
            continue
        fieldnames, rows = read_csv(path)
        staged[name] = rows
        hashes[name] = sha256(path)
        validate_headers(name, fieldnames, issues)
        validate_rows(name, rows, issues)
        if len(rows) != expected_count:
            issue(
                issues,
                file=name,
                code="count_mismatch",
                message=f"Expected {expected_count} records, received {len(rows)}.",
            )
        files.append(
            {
                "file": name,
                "sha256": hashes[name],
                "recordCount": len(rows),
                "normalizationStatus": "draft_requires_independent_review",
                "activatedExecutableRules": 0,
            }
        )

    if all(name in staged for name in EXPECTED):
        validate_references(
            staged["Locus_Catalog.csv"],
            staged["Evidence_Claims.csv"],
            staged["Sources.csv"],
            issues,
        )

    report = {
        "schemaVersion": "1.1",
        "scientificState": "draft_pending_review",
        "files": files,
        "issues": issues,
        "passed": not issues,
        "activatedExecutableRules": 0,
        "guardrails": [
            "Spreadsheet prose is not executable scientific logic.",
            "Independent review is required before catalog publication.",
            "Phenotype rules remain disabled until separately modeled, reviewed, and versioned.",
        ],
    }

    if normalized_dir is not None and not issues:
        normalized_dir.mkdir(parents=True, exist_ok=True)
        outputs = {
            "loci.json": normalize_rows(
                "Locus_Catalog.csv", hashes["Locus_Catalog.csv"], staged["Locus_Catalog.csv"]
            ),
            "claims.json": normalize_rows(
                "Evidence_Claims.csv", hashes["Evidence_Claims.csv"], staged["Evidence_Claims.csv"]
            ),
            "sources.json": normalize_rows(
                "Sources.csv", hashes["Sources.csv"], staged["Sources.csv"]
            ),
        }
        for filename, payload in outputs.items():
            (normalized_dir / filename).write_text(
                json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
                encoding="utf-8",
            )

    return report


def main() -> None:
    parser = argparse.ArgumentParser()
    repository_root = Path(__file__).resolve().parents[1]
    parser.add_argument(
        "source_dir",
        nargs="?",
        type=Path,
        default=repository_root / "docs" / "source-handoff" / "data",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=repository_root / "docs" / "catalog-reconciliation.json",
    )
    parser.add_argument("--normalized-dir", type=Path)
    parser.add_argument(
        "--check",
        action="store_true",
        help="Validate without rewriting normalized catalog JSON.",
    )
    args = parser.parse_args()
    report = reconcile(args.source_dir, None if args.check else args.normalized_dir)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    if not report["passed"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
