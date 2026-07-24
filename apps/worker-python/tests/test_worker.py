from pathlib import Path

from PIL import Image

from worker import deterministic_image_facts, exact_single_locus, handle


def test_health() -> None:
    assert handle({"jobType": "health"})["status"] == "ok"


def test_vision_abstains_without_validated_model() -> None:
    assert handle({"jobType": "vision.measurement"})["status"] == "not_validated"


def test_exact_single_locus_parity_fixture() -> None:
    result = exact_single_locus({
        "locusId": "L1",
        "maternalAlleles": ["A", "B"],
        "paternalAlleles": ["A", "B"],
    })
    assert result["distribution"] == [
        {"alleles": ["A", "A"], "probability": {"numerator": "1", "denominator": "4"}},
        {"alleles": ["A", "B"], "probability": {"numerator": "1", "denominator": "2"}},
        {"alleles": ["B", "B"], "probability": {"numerator": "1", "denominator": "4"}},
    ]


def test_deterministic_image_facts(tmp_path: Path) -> None:
    path = tmp_path / "fixture.png"
    image = Image.new("L", (2, 2))
    image.putdata([0, 64, 128, 255])
    image.save(path, format="PNG")
    import hashlib
    source_hash = hashlib.sha256(path.read_bytes()).hexdigest()
    result = deterministic_image_facts({
        "filePath": str(path),
        "allowedRoot": str(tmp_path),
        "sourceSha256": source_hash,
    })
    assert result["status"] == "ok"
    assert result["width"] == 2
    assert result["height"] == 2
    assert result["meanLuminance"] == 111.75
    assert result["luminanceStandardDeviation"] > 90


def test_image_facts_rejects_hash_mismatch(tmp_path: Path) -> None:
    path = tmp_path / "fixture.png"
    Image.new("RGB", (1, 1), color=(1, 2, 3)).save(path, format="PNG")
    result = handle({
        "jobType": "vision.image-facts",
        "filePath": str(path),
        "allowedRoot": str(tmp_path),
        "sourceSha256": "0" * 64,
    })
    assert result == {"status": "invalid", "error": "image source hash mismatch"}


def test_image_facts_rejects_path_escape(tmp_path: Path) -> None:
    approved = tmp_path / "approved"
    approved.mkdir()
    outside = tmp_path / "outside.png"
    Image.new("RGB", (1, 1), color=(1, 2, 3)).save(outside, format="PNG")
    import hashlib
    result = handle({
        "jobType": "vision.image-facts",
        "filePath": str(outside),
        "allowedRoot": str(approved),
        "sourceSha256": hashlib.sha256(outside.read_bytes()).hexdigest(),
    })
    assert result == {"status": "invalid", "error": "filePath escapes the approved worker directory"}


def test_image_facts_rejects_multiframe_input(tmp_path: Path) -> None:
    path = tmp_path / "animated.gif"
    first = Image.new("RGB", (2, 2), color=(0, 0, 0))
    second = Image.new("RGB", (2, 2), color=(255, 255, 255))
    first.save(path, format="GIF", save_all=True, append_images=[second], duration=50, loop=0)
    import hashlib
    result = handle({
        "jobType": "vision.image-facts",
        "filePath": str(path),
        "allowedRoot": str(tmp_path),
        "sourceSha256": hashlib.sha256(path.read_bytes()).hexdigest(),
    })
    assert result == {
        "status": "invalid",
        "error": "animated or multi-frame images are unavailable for deterministic measurement",
    }


def test_image_facts_applies_exif_orientation_before_dimensions(tmp_path: Path) -> None:
    path = tmp_path / "oriented.jpg"
    image = Image.new("RGB", (2, 3), color=(64, 64, 64))
    exif = Image.Exif()
    exif[274] = 6  # Rotate 90 degrees clockwise for display.
    image.save(path, format="JPEG", exif=exif)
    import hashlib
    result = deterministic_image_facts({
        "filePath": str(path),
        "allowedRoot": str(tmp_path),
        "sourceSha256": hashlib.sha256(path.read_bytes()).hexdigest(),
    })
    assert result["width"] == 3
    assert result["height"] == 2
    assert result["metadataKeys"] == ["274"]
