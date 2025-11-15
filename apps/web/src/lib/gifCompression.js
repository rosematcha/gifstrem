import gifsicle from 'gifsicle-wasm-browser';
const GIFSICLE_INPUT_NAME = 'input.gif';
const GIFSICLE_OUTPUT_NAME = 'compressed.gif';
const COMPRESSION_PRESETS = [
    { lossy: 60, colors: 196 },
    { lossy: 120, colors: 160 },
    { lossy: 200, colors: 128 },
    { lossy: 260, colors: 96 },
];
/**
 * Tries increasingly aggressive presets until the GIF is below the target size
 * or we run out of presets. Returns the best attempt so callers can decide
 * whether the result is acceptable.
 */
export async function compressGifToLimit(file, limitBytes) {
    let workingFile = file;
    const beforeBytes = file.size;
    let attempts = 0;
    for (const preset of COMPRESSION_PRESETS) {
        attempts += 1;
        const [output] = await gifsicle.run({
            input: [{ file: workingFile, name: GIFSICLE_INPUT_NAME }],
            command: [
                `-O3 --lossy=${preset.lossy} --colors ${preset.colors} ${GIFSICLE_INPUT_NAME} -o /out/${GIFSICLE_OUTPUT_NAME}`,
            ],
            isStrict: true,
        });
        if (!output) {
            throw new Error('Compression failed: no output produced.');
        }
        const renamed = await renameOutput(output, file.name);
        workingFile = renamed;
        if (workingFile.size <= limitBytes) {
            return {
                file: workingFile,
                beforeBytes,
                afterBytes: workingFile.size,
                attempts,
                exhaustedPresets: false,
            };
        }
    }
    return {
        file: workingFile,
        beforeBytes,
        afterBytes: workingFile.size,
        attempts,
        exhaustedPresets: true,
    };
}
async function renameOutput(output, targetName) {
    const buffer = await output.arrayBuffer();
    return new File([buffer], targetName, { type: 'image/gif', lastModified: Date.now() });
}
