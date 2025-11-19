import gifsicle from 'gifsicle-wasm-browser';
const GIFSICLE_INPUT_NAME = 'input.gif';
const GIFSICLE_OUTPUT_NAME = 'compressed.gif';
const GIFSICLE_INPUT_PATH = `/${GIFSICLE_INPUT_NAME}`;
const GIFSICLE_OUTPUT_PATH = `/out/${GIFSICLE_OUTPUT_NAME}`;
const LOSSY_STEPS = [40, 80, 120, 160, 200, 240, 280, 320];
const COLOR_STEPS = [256, 224, 196, 160, 128, 96, 80, 64];
const RESIZE_BUCKETS = [768, 640, 512, 384];
/**
 * Tries increasingly aggressive presets (optimize, lossy palettes, and resize)
 * until the GIF is below the target size or we run out of presets. Returns the
 * best attempt so callers can decide whether the result is acceptable.
 */
export async function compressGifToLimit(file, limitBytes) {
    let workingFile = file;
    const beforeBytes = file.size;
    const metadata = await inspectGifMetadata(file);
    const plan = buildCompressionPlan(metadata);
    const history = [];
    let attempts = 0;
    let lastError;
    for (const preset of plan) {
        attempts += 1;
        let outputFile = null;
        let attemptError = null;
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
        }
        catch (error) {
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
    if (!history.length || history.every((entry) => entry.error)) {
        throw new Error(lastError ?? 'Compression failed: no successful preset produced an output.');
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
async function renameOutput(output, targetName) {
    const buffer = await output.arrayBuffer();
    return new File([buffer], targetName, { type: 'image/gif', lastModified: Date.now() });
}
function buildCommand(preset) {
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
function buildCompressionPlan(metadata) {
    const plan = [
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
async function inspectGifMetadata(file) {
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
    }
    catch (error) {
        console.warn('[gifCompression] Unable to read GIF metadata', error);
        return null;
    }
}
function isGifSignature(bytes) {
    if (bytes.length < 6) {
        return false;
    }
    const signature = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5]);
    return signature === 'GIF87a' || signature === 'GIF89a';
}
const GIFSICLE_COMMON_FLAGS = ['-O3', '--no-warnings', '--no-interlace'];
