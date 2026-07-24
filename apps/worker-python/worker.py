#!/usr/bin/env python3
"""Deterministic scientific-worker contract boundary.

This worker provides an independent exact-genetics parity implementation and
bounded machine-observable image facts. It never performs learned phenotype
prediction and never upgrades image facts into biological claims.
"""
from __future__ import annotations

from collections import defaultdict
from fractions import Fraction
import hashlib
import json
import math
import os
from pathlib import Path
import statistics
import sys
from typing import Any


def _apply_process_limits() -> None:
    """Apply Linux worker limits before decoding untrusted images."""
    try:
        import resource
        memory_mb = max(128, min(2048, int(os.environ.get("CAPSICUM_MEMORY_LIMIT_MB", "512"))))
        cpu_seconds = max(5, min(120, int(os.environ.get("CAPSICUM_CPU_LIMIT_SECONDS", "20"))))
        memory_bytes = memory_mb * 1024 * 1024
        resource.setrlimit(resource.RLIMIT_AS, (memory_bytes, memory_bytes))
        resource.setrlimit(resource.RLIMIT_CPU, (cpu_seconds, cpu_seconds + 1))
        resource.setrlimit(resource.RLIMIT_FSIZE, (32 * 1024 * 1024, 32 * 1024 * 1024))
        resource.setrlimit(resource.RLIMIT_NOFILE, (64, 64))
    except (ImportError, ValueError, OSError):
        # Container resource limits remain the outer fail-closed boundary.
        return



def _identifier(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{label} is required")
    return value.strip()


def exact_single_locus(payload: dict[str, Any]) -> dict[str, Any]:
    locus_id = _identifier(payload.get("locusId"), "locusId")
    maternal = payload.get("maternalAlleles")
    paternal = payload.get("paternalAlleles")
    if not isinstance(maternal, list) or len(maternal) != 2:
        raise ValueError("maternalAlleles must contain exactly two allele identifiers")
    if not isinstance(paternal, list) or len(paternal) != 2:
        raise ValueError("paternalAlleles must contain exactly two allele identifiers")
    maternal = [_identifier(value, "maternal allele") for value in maternal]
    paternal = [_identifier(value, "paternal allele") for value in paternal]
    outcomes: dict[tuple[str, str], Fraction] = defaultdict(Fraction)
    for maternal_allele in maternal:
        for paternal_allele in paternal:
            alleles = tuple(sorted((maternal_allele, paternal_allele)))
            outcomes[alleles] += Fraction(1, 4)
    return {
        "status": "ok",
        "authority": "exact_parity",
        "locusId": locus_id,
        "distribution": [
            {
                "alleles": list(alleles),
                "probability": {
                    "numerator": str(probability.numerator),
                    "denominator": str(probability.denominator),
                },
            }
            for alleles, probability in sorted(outcomes.items())
        ],
    }


def deterministic_image_facts(payload: dict[str, Any]) -> dict[str, Any]:
    from PIL import Image, ImageOps, UnidentifiedImageError

    file_path = Path(_identifier(payload.get("filePath"), "filePath")).resolve(strict=True)
    allowed_root = Path(_identifier(payload.get("allowedRoot"), "allowedRoot")).resolve(strict=True)
    if file_path != allowed_root and allowed_root not in file_path.parents:
        raise ValueError("filePath escapes the approved worker directory")
    byte_length = file_path.stat().st_size
    if byte_length <= 0 or byte_length > 25 * 1024 * 1024:
        raise ValueError("image byte length exceeds the approved bound")
    source_bytes = file_path.read_bytes()
    source_sha256 = hashlib.sha256(source_bytes).hexdigest()
    expected_sha256 = _identifier(payload.get("sourceSha256"), "sourceSha256")
    if source_sha256 != expected_sha256:
        raise ValueError("image source hash mismatch")
    try:
        with Image.open(file_path) as source:
            if getattr(source, "n_frames", 1) != 1:
                raise ValueError("animated or multi-frame images are unavailable for deterministic measurement")
            source.verify()
        with Image.open(file_path) as source:
            image = ImageOps.exif_transpose(source)
            width, height = image.size
            if width < 1 or height < 1 or width > 20_000 or height > 20_000 or width * height > 80_000_000:
                raise ValueError("image dimensions exceed the approved bound")
            grayscale = image.convert("L")
            histogram = grayscale.histogram()
            count = sum(histogram)
            if count != width * height:
                raise ValueError("decoded pixel count is inconsistent")
            mean = sum(index * frequency for index, frequency in enumerate(histogram)) / count
            variance = sum(((index - mean) ** 2) * frequency for index, frequency in enumerate(histogram)) / count
            return {
                "status": "ok",
                "authority": "machine_observed_parity",
                "sourceSha256": source_sha256,
                "byteLength": byte_length,
                "width": width,
                "height": height,
                "meanLuminance": mean,
                "luminanceStandardDeviation": math.sqrt(variance),
                "frameCount": 1,
                "metadataKeys": sorted(str(key) for key in source.getexif().keys()),
                "algorithm": "pillow-grayscale-histogram",
                "algorithmVersion": getattr(Image, "__version__", "unknown"),
            }
    except (UnidentifiedImageError, OSError) as error:
        raise ValueError("image decoder rejected the source") from error


def handle(payload: dict[str, Any]) -> dict[str, Any]:
    job_type = payload.get("jobType")
    if job_type == "health":
        return {"status": "ok", "worker": "python", "version": "0.3.0"}
    if job_type == "genetics.exact-single-locus-parity":
        try:
            return exact_single_locus(payload)
        except ValueError as error:
            return {"status": "invalid", "error": str(error)}
    if job_type == "vision.image-facts":
        try:
            return deterministic_image_facts(payload)
        except (ValueError, OSError) as error:
            return {"status": "invalid", "error": str(error)}
    if job_type == "vision.measurement":
        return {
            "status": "not_validated",
            "measurements": [],
            "warnings": ["No independently promoted learned phenotype model was supplied."],
            "inputHash": hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest(),
        }
    return {"status": "unsupported", "error": "Unknown job type."}


def main(argv: list[str]) -> int:
    _apply_process_limits()
    if len(argv) > 1 and argv[1] == "health":
        request: dict[str, Any] = {"jobType": "health"}
    else:
        raw = sys.stdin.read().strip()
        request = json.loads(raw or "{}")
    json.dump(handle(request), sys.stdout, sort_keys=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
