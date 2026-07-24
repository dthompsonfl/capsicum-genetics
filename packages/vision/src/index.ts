export type CaptureQualityState = 'accepted' | 'rejected' | 'needs_review';

export interface CaptureProtocol {
  protocolId: string;
  version: string;
  minimumWidthPx: number;
  minimumHeightPx: number;
  maximumBlurScore: number;
  requiredViews: readonly string[];
  requiresScaleReference: boolean;
  requiresColorReference: boolean;
}

export interface ImageCaptureMetadata {
  imageId: string;
  widthPx: number;
  heightPx: number;
  blurScore: number | null;
  view: string;
  hasScaleReference: boolean;
  hasColorReference: boolean;
  sourceSha256: string;
}

export interface QualityGateResult {
  state: CaptureQualityState;
  blockingReasons: string[];
  reviewReasons: string[];
}

export interface DeterministicLengthInput {
  pixelLength: number;
  referencePixelLength: number;
  referenceMillimeters: number;
  quality: QualityGateResult;
  methodVersion: string;
}

export interface DeterministicMeasurement {
  value: number | null;
  unit: 'mm';
  authority: 'deterministic_measurement' | 'unavailable';
  methodVersion: string;
  abstentions: string[];
}

function positiveFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${label} must be positive and finite.`);
}

export function evaluateCaptureQuality(
  protocol: CaptureProtocol,
  image: ImageCaptureMetadata,
): QualityGateResult {
  const blockingReasons: string[] = [];
  const reviewReasons: string[] = [];
  if (image.widthPx < protocol.minimumWidthPx || image.heightPx < protocol.minimumHeightPx) {
    blockingReasons.push('Image resolution is below the capture protocol minimum.');
  }
  if (!protocol.requiredViews.includes(image.view)) {
    blockingReasons.push(`View “${image.view}” is not allowed by this protocol.`);
  }
  if (protocol.requiresScaleReference && !image.hasScaleReference) {
    blockingReasons.push('A calibrated scale reference is required.');
  }
  if (protocol.requiresColorReference && !image.hasColorReference) {
    blockingReasons.push('A color reference is required.');
  }
  if (image.blurScore === null) {
    reviewReasons.push('Blur score is unavailable and requires human review.');
  } else if (image.blurScore > protocol.maximumBlurScore) {
    blockingReasons.push('Image blur exceeds the protocol threshold.');
  }
  return {
    state: blockingReasons.length > 0 ? 'rejected' : reviewReasons.length > 0 ? 'needs_review' : 'accepted',
    blockingReasons,
    reviewReasons,
  };
}

export function measureCalibratedLength(input: DeterministicLengthInput): DeterministicMeasurement {
  if (input.quality.state !== 'accepted') {
    return {
      value: null,
      unit: 'mm',
      authority: 'unavailable',
      methodVersion: input.methodVersion,
      abstentions: ['Deterministic measurement is blocked until the capture quality gate is accepted.'],
    };
  }
  positiveFinite(input.pixelLength, 'pixelLength');
  positiveFinite(input.referencePixelLength, 'referencePixelLength');
  positiveFinite(input.referenceMillimeters, 'referenceMillimeters');
  return {
    value: (input.pixelLength / input.referencePixelLength) * input.referenceMillimeters,
    unit: 'mm',
    authority: 'deterministic_measurement',
    methodVersion: input.methodVersion,
    abstentions: ['This measurement does not identify genotype, disease, flavor, pungency, or breeding value.'],
  };
}

export function learnedVisionAvailability(modelState: 'missing' | 'draft' | 'validated' | 'retired') {
  return modelState === 'validated'
    ? { state: 'available' as const, authority: 'model_conditional' as const }
    : {
        state: 'not_validated' as const,
        authority: 'unavailable' as const,
        reason: 'A learned model must pass dataset, evaluation, review, and promotion gates.',
      };
}
