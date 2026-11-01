// The part of libheif-js's JavaScript wrapper we use. Its own .d.ts only describes the raw WASM exports.
declare module "libheif-js/libheif-wasm/libheif-bundle.mjs" {
  interface HeifImage {
    get_width(): number;
    get_height(): number;
    is_primary(): boolean;
    has_alpha_channel(): boolean;
    /** Decodes into `target.data` (RGBA, not premultiplied), then calls back with it, or with null on failure. */
    display(
      target: { data: Uint8ClampedArray; width: number; height: number },
      done: (result: { data: Uint8ClampedArray } | null) => void,
    ): void;
    free(): void;
  }
  interface Libheif {
    HeifDecoder: new () => { decode(bytes: Uint8Array): HeifImage[] };
  }
  /** Compiles the bundled WASM (synchronously) and returns the module. */
  export default function libheif(options?: object): Libheif;
}
