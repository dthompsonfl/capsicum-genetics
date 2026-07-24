import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import sharp from 'sharp';

export interface DeterministicDerivative {
  derivativeType: 'thumbnail' | 'analysis_ready';
  extension: 'jpg' | 'png';
  mediaType: 'image/jpeg' | 'image/png';
  bytes: Uint8Array;
  widthPx: number;
  heightPx: number;
  algorithmName: string;
  algorithmVersion: string;
  parameters: Record<string, unknown>;
}

export interface VerifiedImageFacts {
  width: number;
  height: number;
  meanLuminance: number;
  luminanceStandardDeviation: number;
  algorithmName: string;
  algorithmVersion: string;
  parityEvidence: {
    verifier: string;
    verifierVersion: string;
    meanDelta: number;
    standardDeviationDelta: number;
  };
}

interface PythonImageFacts {
  status: 'ok';
  sourceSha256: string;
  width: number;
  height: number;
  meanLuminance: number;
  luminanceStandardDeviation: number;
  algorithm: string;
  algorithmVersion: string;
}

export async function createDeterministicDerivatives(source: Uint8Array | string): Promise<readonly DeterministicDerivative[]> {
  const algorithmName = 'sharp-libvips-metadata-stripping-resize';
  const algorithmVersion = `sharp-${sharp.versions.sharp};libvips-${sharp.versions.vips}`;
  const definitions = [
    { derivativeType: 'thumbnail', maximumDimension: 512, extension: 'jpg', mediaType: 'image/jpeg' },
    { derivativeType: 'analysis_ready', maximumDimension: 2048, extension: 'png', mediaType: 'image/png' },
  ] as const;
  const derivatives: DeterministicDerivative[] = [];
  for (const definition of definitions) {
    const base = sharp(source, {
      failOn: 'warning',
      limitInputPixels: 80_000_000,
      animated: false,
      sequentialRead: true,
    }).rotate().resize({
      width: definition.maximumDimension,
      height: definition.maximumDimension,
      fit: 'inside',
      withoutEnlargement: true,
      fastShrinkOnLoad: false,
    });
    const output = definition.derivativeType === 'thumbnail'
      ? await base.jpeg({ quality: 85, chromaSubsampling: '4:4:4', mozjpeg: true }).toBuffer({ resolveWithObject: true })
      : await base.png({ compressionLevel: 9, adaptiveFiltering: false, palette: false }).toBuffer({ resolveWithObject: true });
    derivatives.push({
      derivativeType: definition.derivativeType,
      extension: definition.extension,
      mediaType: definition.mediaType,
      bytes: output.data,
      widthPx: output.info.width,
      heightPx: output.info.height,
      algorithmName,
      algorithmVersion,
      parameters: {
        maximumDimension: definition.maximumDimension,
        fit: 'inside',
        withoutEnlargement: true,
        orientation: 'auto-rotated',
        metadata: 'stripped',
        ...(definition.derivativeType === 'thumbnail'
          ? { format: 'jpeg', quality: 85, chromaSubsampling: '4:4:4' }
          : { format: 'png', compressionLevel: 9 }),
      },
    });
  }
  return derivatives;
}

async function sharpImageFacts(source: Uint8Array | string): Promise<Omit<VerifiedImageFacts, 'parityEvidence'>> {
  const decoded = await sharp(source, {
    failOn: 'warning',
    limitInputPixels: 80_000_000,
    animated: false,
    sequentialRead: true,
  })
    .rotate()
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = decoded.info;
  if (width < 1 || height < 1 || width > 20_000 || height > 20_000
      || width * height > 80_000_000 || channels !== 1 || decoded.data.length !== width * height) {
    throw Object.assign(new Error('Decoded image dimensions or pixel count violate the approved processing limit.'), { code: 'image_dimension_invalid' });
  }
  let total = 0;
  for (const value of decoded.data) total += value;
  const meanLuminance = total / decoded.data.length;
  let squaredDeviationTotal = 0;
  for (const value of decoded.data) squaredDeviationTotal += (value - meanLuminance) ** 2;
  return {
    width,
    height,
    meanLuminance,
    luminanceStandardDeviation: Math.sqrt(squaredDeviationTotal / decoded.data.length),
    algorithmName: 'sharp-libvips-oriented-grayscale-buffer',
    algorithmVersion: `sharp-${sharp.versions.sharp};libvips-${sharp.versions.vips}`,
  };
}

async function independentPythonImageFacts(source: Uint8Array | string, sourceSha256: string): Promise<PythonImageFacts> {
  const temporaryDirectory = typeof source === 'string' ? null : await mkdtemp(join(tmpdir(), 'capsicum-python-vision-'));
  const filePath = typeof source === 'string' ? source : join(temporaryDirectory!, 'source-image');
  const allowedRoot = typeof source === 'string' ? dirname(source) : temporaryDirectory!;
  const workerPath = process.env.PYTHON_WORKER_PATH?.trim() || '/opt/capsicum-python-worker/worker.py';
  try {
    if (typeof source !== 'string') await writeFile(filePath, source, { mode: 0o600, flag: 'wx' });
    return await new Promise<PythonImageFacts>((resolve, reject) => {
      const child = spawn('python3', [workerPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          PATH: process.env.PATH ?? '/usr/bin:/bin',
          PYTHONDONTWRITEBYTECODE: '1',
          PYTHONUNBUFFERED: '1',
          CAPSICUM_MEMORY_LIMIT_MB: process.env.PYTHON_VISION_MEMORY_MB ?? '512',
          CAPSICUM_CPU_LIMIT_SECONDS: process.env.PYTHON_VISION_CPU_SECONDS ?? '20',
        },
      });
      const timeout = setTimeout(() => child.kill('SIGKILL'), 30_000);
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf8');
        if (stdout.length > 1_000_000) child.kill('SIGKILL');
      });
      child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8').slice(0, 10_000); });
      child.once('error', (error) => {
        clearTimeout(timeout);
        reject(Object.assign(error, { code: 'python_vision_unavailable' }));
      });
      child.once('exit', (code) => {
        clearTimeout(timeout);
        if (code !== 0) {
          reject(Object.assign(new Error(`Independent Python image verifier exited with ${code}: ${stderr.slice(0, 500)}`), { code: 'python_vision_failed' }));
          return;
        }
        try {
          const parsed = JSON.parse(stdout) as Partial<PythonImageFacts> & { error?: string };
          if (parsed.status !== 'ok' || typeof parsed.sourceSha256 !== 'string'
              || typeof parsed.width !== 'number' || typeof parsed.height !== 'number'
              || typeof parsed.meanLuminance !== 'number' || typeof parsed.luminanceStandardDeviation !== 'number'
              || typeof parsed.algorithm !== 'string' || typeof parsed.algorithmVersion !== 'string') {
            throw new Error(parsed.error || 'Independent Python image verifier returned an invalid result.');
          }
          resolve(parsed as PythonImageFacts);
        } catch (error) {
          reject(Object.assign(error instanceof Error ? error : new Error('Python image result was invalid.'), { code: 'python_vision_result_invalid' }));
        }
      });
      child.stdin.end(JSON.stringify({ jobType: 'vision.image-facts', filePath, allowedRoot, sourceSha256 }));
    });
  } finally {
    if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function verifiedImageFacts(source: Uint8Array | string, sourceSha256: string): Promise<VerifiedImageFacts> {
  const primary = await sharpImageFacts(source);
  const parity = await independentPythonImageFacts(source, sourceSha256);
  const meanDelta = Math.abs(parity.meanLuminance - primary.meanLuminance);
  const standardDeviationDelta = Math.abs(parity.luminanceStandardDeviation - primary.luminanceStandardDeviation);
  if (parity.sourceSha256 !== sourceSha256 || parity.width !== primary.width || parity.height !== primary.height
      || meanDelta > 2 || standardDeviationDelta > 3) {
    throw Object.assign(new Error('Independent image decoders disagreed beyond the approved tolerance.'), { code: 'image_fact_parity_mismatch' });
  }
  return {
    ...primary,
    parityEvidence: {
      verifier: parity.algorithm,
      verifierVersion: parity.algorithmVersion,
      meanDelta,
      standardDeviationDelta,
    },
  };
}
