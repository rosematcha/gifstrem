declare module 'gifsicle-wasm-browser' {
  type GifsicleInputFile =
    | File
    | Blob
    | ArrayBuffer
    | string;

  type GifsicleInput = {
    file: GifsicleInputFile;
    name: string;
  };

  type RunOptions = {
    input: GifsicleInput[];
    command: string[];
    folder?: string[];
    isStrict?: boolean;
    start?: (input: GifsicleInput[]) => void;
  };

  type RunResult = Promise<File[]>;

  type Gifsicle = {
    run(options: RunOptions): RunResult;
    tool: Record<string, unknown>;
  };

  const gifsicle: Gifsicle;
  export default gifsicle;
}
