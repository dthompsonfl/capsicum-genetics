import { describe, expect, it } from 'vitest';
import { evaluateCaptureQuality, learnedVisionAvailability, measureCalibratedLength, type CaptureProtocol } from './index';

const protocol: CaptureProtocol = {
  protocolId: 'fruit-standard', version: '1.0', minimumWidthPx: 1200, minimumHeightPx: 800,
  maximumBlurScore: 0.2, requiredViews: ['lateral'], requiresScaleReference: true,
  requiresColorReference: true,
};

describe('phenotype image governance', () => {
  it('blocks missing calibration and low resolution', () => {
    const result = evaluateCaptureQuality(protocol, {
      imageId: 'i', widthPx: 600, heightPx: 400, blurScore: 0.1, view: 'lateral',
      hasScaleReference: false, hasColorReference: true, sourceSha256: 'a'.repeat(64),
    });
    expect(result.state).toBe('rejected');
    expect(result.blockingReasons).toHaveLength(2);
  });

  it('computes only a calibrated deterministic length', () => {
    expect(measureCalibratedLength({
      pixelLength: 400, referencePixelLength: 100, referenceMillimeters: 10,
      quality: { state: 'accepted', blockingReasons: [], reviewReasons: [] }, methodVersion: 'length-v1',
    }).value).toBe(40);
  });

  it('keeps unvalidated learned models unavailable', () => {
    expect(learnedVisionAvailability('draft').state).toBe('not_validated');
  });
});
