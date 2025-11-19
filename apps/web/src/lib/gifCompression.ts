import gifsicle from 'gifsicle-wasm-browser';
import { decompressFrames, parseGIF } from 'gifuct-js';
// @ts-expect-error gif-encoder-2 has no types
import GIFEncoder from 'gif-encoder-2';

const GIFSICLE_INPUT_NAME = 'input.gif';
const GIFSICLE_OUTPUT_NAME = 'compressed.gif';
const GIFSICLE_INPUT_PATH = `/${GIFSICLE_INPUT_NAME}`;
const GIFSICLE_OUTPUT_PATH = `/out/${GIFSICLE_OUTPUT_NAME}`;

const LOSSY_STEPS = [40, 80, 120, 160, 200, 240, 280, 320];
const COLOR_STEPS = [256, 224, 196, 160, 128, 96, 80, 64];
const RESIZE_BUCKETS = [768, 640, 512, 384];
const FALLBACK_MIN_DIMENSION = 192;
const FALLBACK_SHRINK_STEP = 0.75;

type CompressionPreset = {
  lossy?: number;
  colors?: number;
  resizeTo?: number;
  description: string;
};

type CompressionAttemptSummary = {
  preset: CompressionPreset;
  bytes?: number;
  error?: string;
};

type GifMetadata = {
  width: number;
  height: number;
};

export type CompressionResult = {
  file: File;
  beforeBytes: number;
  afterBytes: number;
  attempts: number;
  exhaustedPresets: boolean;
  history: CompressionAttemptSummary[];
  metadata?: GifMetadata | null;
  lastPresetDescription?: string;
};

/**
 * Tries increasingly aggressive presets (optimize, lossy palettes, and resize)
 * until the GIF is below the target size or we run out of presets. Returns the
 * best attempt so callers can decide whether the result is acceptable.
 */
export async function compressGifToLimit(file: File, limitBytes: number): Promise<CompressionResult> {
  let workingFile = file;
  const beforeBytes = file.size;
  const metadata = await inspectGifMetadata(file);
  const plan = buildCompressionPlan(metadata);
  const history: CompressionAttemptSummary[] = [];
  let attempts = 0;
  let lastError: string | undefined;

  for (const preset of plan) {
    attempts += 1;
    let outputFile: File | null = null;
    let attemptError: string | null = null;
    try {
      const [output] = await gifsicle.run({
        input: [{ file: workingFile, name: GIFSICLE_INPUT_NAME }],
        command: buildCommand(preset),
        // Strict mode treats any stderr line as a hard failure; some gifsicle
        // builds emit benign noise in the browser environment. We validate the
        // output ourselves below instead.
        isStrict: false,
      });

      if (!output) {
        throw new Error('Compression failed: no output produced.');
      }

      outputFile = await renameOutput(output, file.name);
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        attemptError = `[gifCompression] Failed during "${preset.description}": ${reason}`;
    }

    if (!outputFile || attemptError) {
      lastError = attemptError ?? 'Unknown gifsicle failure';
      history.push({ preset, error: lastError });
      continue;
    }

    workingFile = outputFile;
    history.push({ preset, bytes: workingFile.size });

    if (workingFile.size <= limitBytes) {
      return {
        file: workingFile,
        beforeBytes,
        afterBytes: workingFile.size,
        attempts,
        exhaustedPresets: false,
        history,
        metadata,
        lastPresetDescription: preset.description,
      };
    }
  }

  const shouldFallback = workingFile.size > limitBytes || !history.length || history.every((entry) => entry.error);

  if (shouldFallback) {
    // Attempt a canvas-based fallback if gifsicle cannot produce output in this environment.
    try {
      const fallback = await fallbackCompressGif(workingFile, limitBytes);
      history.push({ preset: { description: 'Fallback canvas encoder' }, bytes: fallback.size });
      return {
        file: fallback,
        beforeBytes,
        afterBytes: fallback.size,
        attempts: attempts + 1,
        exhaustedPresets: false,
        history,
        metadata,
        lastPresetDescription: 'Fallback canvas encoder',
      };
    } catch (fallbackError) {
      const fallbackReason = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
      throw new Error(lastError ?? `Compression failed: ${fallbackReason}`);
    }
  }

  const lastPreset = history.length ? history[history.length - 1].preset : undefined;

  return {
    file: workingFile,
    beforeBytes,
    afterBytes: workingFile.size,
    attempts,
    exhaustedPresets: true,
    history,
    metadata,
    lastPresetDescription: lastPreset?.description,
  };
}

async function renameOutput(output: File, targetName: string) {
  const buffer = await output.arrayBuffer();
  return new File([buffer], targetName, { type: 'image/gif', lastModified: Date.now() });
}

function buildCommand(preset: CompressionPreset) {
  const command = [...GIFSICLE_COMMON_FLAGS];

  if (typeof preset.lossy === 'number' && preset.lossy > 0) {
    command.push(`--lossy=${preset.lossy}`);
  }

  if (typeof preset.colors === 'number' && preset.colors > 0) {
    command.push('--colors', `${preset.colors}`);
  }

  if (typeof preset.resizeTo === 'number' && preset.resizeTo > 0) {
    command.push('--resize-fit', `${preset.resizeTo}x${preset.resizeTo}`);
  }

  command.push(GIFSICLE_INPUT_PATH, '-o', GIFSICLE_OUTPUT_PATH);
  return command;
}

function buildCompressionPlan(metadata: GifMetadata | null): CompressionPreset[] {
  const plan: CompressionPreset[] = [
    {
      description: 'Optimize frames only (-O3)',
    },
  ];

  for (let index = 0; index < LOSSY_STEPS.length; index += 1) {
    const lossy = LOSSY_STEPS[index];
    const colors = COLOR_STEPS[Math.min(index, COLOR_STEPS.length - 1)];
    plan.push({
      lossy,
      colors,
      description: `Lossy ${lossy} / ${colors} colors`,
    });
  }

  if (metadata) {
    const maxDimension = Math.max(metadata.width, metadata.height);
    for (const bucket of RESIZE_BUCKETS) {
      if (maxDimension <= bucket) {
        continue;
      }

      plan.push({
        lossy: 220,
        colors: 128,
        resizeTo: bucket,
        description: `Resize to ${bucket}px (lossy 220 / 128 colors)`,
      });

      plan.push({
        lossy: 280,
        colors: 96,
        resizeTo: bucket,
        description: `Resize to ${bucket}px (lossy 280 / 96 colors)`,
      });
    }
  }

  return plan;
}

async function inspectGifMetadata(file: File): Promise<GifMetadata | null> {
  try {
    const header = await file.slice(0, 32).arrayBuffer();
    const bytes = new Uint8Array(header);

    if (!isGifSignature(bytes)) {
      return null;
    }

    if (bytes.length < 10) {
      return null;
    }

    const width = bytes[6] | (bytes[7] << 8);
    const height = bytes[8] | (bytes[9] << 8);
    return { width, height };
  } catch (error) {
    console.warn('[gifCompression] Unable to read GIF metadata', error);
    return null;
  }
}

function isGifSignature(bytes: Uint8Array) {
  if (bytes.length < 6) {
    return false;
  }

  const signature = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5]);
  return signature === 'GIF87a' || signature === 'GIF89a';
}

async function fallbackCompressGif(file: File, limitBytes: number): Promise<File> {
  const arrayBuffer = await file.arrayBuffer();
  const parsed = parseGIF(new Uint8Array(arrayBuffer));
  const frames = decompressFrames(parsed, true) as any[];
  if (!frames.length) {
    throw new Error('Fallback compression failed: no frames parsed.');
  }

  const { width, height } = frames[0].dims;
  let targetWidth = width;
  let targetHeight = height;

  let lastBlob = await encodeGifFrames(frames, targetWidth, targetHeight);
  while (lastBlob.size > limitBytes && Math.max(targetWidth, targetHeight) > FALLBACK_MIN_DIMENSION) {
    targetWidth = Math.max(Math.floor(targetWidth * FALLBACK_SHRINK_STEP), FALLBACK_MIN_DIMENSION);
    targetHeight = Math.max(Math.floor(targetHeight * FALLBACK_SHRINK_STEP), FALLBACK_MIN_DIMENSION);
    lastBlob = await encodeGifFrames(frames, targetWidth, targetHeight);
  }

  return new File([lastBlob], file.name, { type: 'image/gif', lastModified: Date.now() });
}

async function encodeGifFrames(frames: any[], width: number, height: number): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Fallback compression failed: cannot obtain 2d context.');
  }

  const encoder = new GIFEncoder(width, height, 'neuquant', true);
  encoder.setRepeat(0);
  encoder.setQuality(30);

  for (const frame of frames) {
    drawFrameToContext(ctx, frame, width, height);
    encoder.setDelay((frame.delay ?? 10) * 10); // delay is in hundredths; encoder expects ms
    encoder.addFrame(ctx);
  }

  const buffer: Uint8Array = encoder.out.getData();
  return new Blob([buffer], { type: 'image/gif' });
}

function drawFrameToContext(ctx: CanvasRenderingContext2D, frame: any, width: number, height: number) {
  const imageData = new ImageData(
    new Uint8ClampedArray(frame.patch),
    frame.dims.width,
    frame.dims.height,
  );
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = frame.dims.width;
  tempCanvas.height = frame.dims.height;
  const tempCtx = tempCanvas.getContext('2d');
  if (!tempCtx) {
    throw new Error('Fallback compression failed: cannot obtain temp 2d context.');
  }
  tempCtx.putImageData(imageData, 0, 0);

  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(tempCanvas, 0, 0, width, height);
}

const GIFSICLE_COMMON_FLAGS = ['-O3', '--no-warnings', '--no-interlace'];
