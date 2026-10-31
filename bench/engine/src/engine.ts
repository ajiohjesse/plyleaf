// The common surface each candidate engine implements for the spike. Not the product engine API (that comes next in M1).
export interface BenchDoc {
  pageCount: number;
  /** Page size in PDF points, unrotated. */
  pageSize(index: number): Promise<{ width: number; height: number }>;
  /** Renders a page into the canvas at `scale` (1 = 72 dpi). Engines without a renderer omit this. */
  render?(index: number, scale: number, canvas: HTMLCanvasElement): Promise<void>;
  close(): void;
}

export interface Engine {
  name: string;
  /** Loads code and WASM; everything after this is warm. */
  init(): Promise<void>;
  open(bytes: Uint8Array): Promise<BenchDoc>;
  /** Concatenates all pages of every input and returns the saved file. */
  merge?(inputs: Uint8Array[]): Promise<Uint8Array>;
  /** Rotates every page by 90° and returns the saved file. */
  rotateAll?(input: Uint8Array): Promise<Uint8Array>;
}

export function paint(canvas: HTMLCanvasElement, rgba: Uint8ClampedArray<ArrayBuffer>, width: number, height: number) {
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.putImageData(new ImageData(rgba, width, height), 0, 0);
}
