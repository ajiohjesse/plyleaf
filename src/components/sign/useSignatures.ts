import { useCallback, useEffect, useRef, useState } from "react";
import type { SignatureKind } from "~/sign/ink";
import { deleteSignature, loadSignatures, saveSignature, type SavedSignature } from "~/sign/store";
import type { SignatureImage } from "./render";

/** A signature or initials the user can put on pages: saved on this device, or only for now. */
export interface Signature extends SavedSignature {
  /** An object URL that shows it. */
  url: string;
  /** Saved on this device (rather than only kept while the page is open). */
  kept: boolean;
}

/** "loading" until the saved ones are read; "unavailable" when this browser won't store them (private windows). */
export type Storage = "loading" | "ready" | "unavailable";

const withUrl = (signature: SavedSignature, kept: boolean): Signature => ({
  ...signature,
  url: URL.createObjectURL(new Blob([signature.png.slice()], { type: "image/png" })),
  kept,
});

const newId = () =>
  typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36)}`;

/** The user's signatures and initials: those saved on this device, and any made just for now. */
export function useSignatures() {
  const [signatures, setSignatures] = useState<Signature[]>([]);
  const [storage, setStorage] = useState<Storage>("loading");
  const urls = useRef(new Set<string>());

  useEffect(() => {
    let current = true;
    loadSignatures().then(
      (saved) => {
        if (!current) return;
        const shown = saved.map((signature) => withUrl(signature, true));
        shown.forEach((signature) => urls.current.add(signature.url));
        setSignatures((now) => [...shown, ...now]);
        setStorage("ready");
      },
      () => current && setStorage("unavailable"),
    );
    const made = urls.current;
    return () => {
      current = false;
      made.forEach((url) => URL.revokeObjectURL(url));
      made.clear();
    };
  }, []);

  /** Adds a new one, saved on this device when `remember` (and the browser allows it). */
  const add = useCallback(
    async (kind: SignatureKind, image: SignatureImage, remember: boolean): Promise<Signature> => {
      const saved: SavedSignature = { id: newId(), kind, ...image, created: Date.now() };
      let kept = false;
      if (remember && storage === "ready") {
        try {
          await saveSignature(saved);
          kept = true;
        } catch {
          setStorage("unavailable");
        }
      }
      const signature = withUrl(saved, kept);
      urls.current.add(signature.url);
      setSignatures((now) => [...now, signature]);
      return signature;
    },
    [storage],
  );

  /** Forgets one: off this device too, if it was saved. */
  const remove = useCallback(async (signature: Signature) => {
    if (signature.kept) await deleteSignature(signature.id).catch(() => undefined);
    URL.revokeObjectURL(signature.url);
    urls.current.delete(signature.url);
    setSignatures((now) => now.filter((each) => each.id !== signature.id));
  }, []);

  return { signatures, storage, add, remove };
}
