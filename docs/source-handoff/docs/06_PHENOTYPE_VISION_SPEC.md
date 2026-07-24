# Phenotype Vision Specification

## Goal

Provide standardized image capture, deterministic measurements, annotation workflows, and validated task-specific models for pepper plants and fruit.

## Capture protocols

Each protocol defines:

- material type and developmental stage;
- required views;
- background and lighting;
- distance and camera orientation;
- scale object;
- color calibration target;
- device metadata;
- file format and resolution;
- operator instructions;
- allowable quality thresholds.

Supported initial protocols:

1. Detached fruit on calibrated background.
2. Whole plant, front and side views.
3. Leaf close-up.
4. Fruit cross-section.
5. Symptom close-up with context image.

## Quality gate

Before analysis, assess:

- blur/sharpness;
- exposure and clipping;
- occlusion;
- required calibration visibility;
- background compliance;
- object completeness;
- resolution;
- duplicate or near-duplicate capture;
- metadata consistency.

A failed capture does not silently produce authoritative measurements.

## Deterministic pipeline

Use OpenCV/PlantCV-style processing for:

- color correction;
- geometric calibration;
- object segmentation where reliable;
- length, width, area, perimeter, aspect ratio, curvature, and shape descriptors;
- color distributions in calibrated spaces;
- count and location measurements;
- mask and overlay generation.

Every measurement records protocol, algorithm version, calibration, raw image, mask, and human edits.

## Learned models

Task-specific models may cover:

- fruit detection and instance segmentation;
- maturity-stage classification;
- fruit shape classes;
- anthocyanin patterns;
- leaf or fruit symptom candidate classification;
- plant architecture measurements;
- flower/fruit counting.

SAM-style models may accelerate annotation but their zero-shot masks are not automatically ground truth.

## Human-in-the-loop

- Users can correct masks, object counts, maturity stage, and classification.
- Corrections are stored as new annotation revisions.
- Model outputs and human observations remain distinguishable.
- Active-learning queues prioritize uncertain and out-of-distribution examples.

## Dataset governance

Split datasets by accession/family, environment/season, and capture device where possible. Prevent near-duplicate leakage. Track labeler, protocol, label version, consent/license, and exclusion reasons.

## Evaluation

Depending on task, report:

- IoU/Dice and boundary error;
- mean absolute measurement error against physical measurements;
- precision, recall, F1, calibration, and confusion matrix;
- device-, accession-, color-, size-, and environment-stratified performance;
- out-of-distribution detection;
- human correction rate.

An image-analysis feature must state the validated protocol and applicability.
