import { useEffect, useRef, useState } from "react";
import { captureFrame } from "~/scan/photo";

interface Props {
  onCapture: (photo: Blob) => void;
  onClose: () => void;
}

/**
 * The live camera (the back one on phones), with a shutter button. Each photo is handed over as it's taken, so a
 * multi-page document is scanned page after page without leaving the camera. The video never leaves the device.
 */
export function Camera({ onCapture, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<"starting" | "live" | "failed">("starting");
  const [taken, setTaken] = useState(0);

  useEffect(() => {
    let stream: MediaStream | undefined;
    let stopped = false;
    navigator.mediaDevices
      .getUserMedia({
        video: { facingMode: "environment", width: { ideal: 2560 }, height: { ideal: 1920 } },
        audio: false,
      })
      .then((media) => {
        stream = media;
        if (stopped) return media.getTracks().forEach((track) => track.stop());
        const video = videoRef.current!;
        video.srcObject = media;
        return video.play().then(() => setState("live"));
      })
      .catch(() => !stopped && setState("failed"));
    return () => {
      stopped = true;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  async function shoot() {
    const video = videoRef.current;
    if (!video || state !== "live") return;
    onCapture(await captureFrame(video));
    setTaken((n) => n + 1);
  }

  return (
    <section aria-label="Camera" className="space-y-3 rounded-card border border-line bg-ink p-3 text-surface">
      {state === "failed" ? (
        <p role="alert" className="rounded-lg bg-surface p-4 text-ink">
          Plyleaf couldn't use a camera. Allow camera access for this site in your browser, or use Add photos instead
          (on a phone it can open the camera app).
        </p>
      ) : (
        <video
          ref={videoRef}
          muted
          playsInline
          aria-label="Camera view"
          className="mx-auto max-h-[65vh] w-full rounded-lg bg-black object-contain"
        />
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <output className="text-sm" aria-live="polite">
          {state === "starting"
            ? "Starting the camera…"
            : taken > 0
              ? `${taken} taken. Take the next page, or finish.`
              : "Fit the page in the frame, then take the photo."}
        </output>
        <div className="flex gap-2">
          {state !== "failed" && (
            <button
              type="button"
              disabled={state !== "live"}
              onClick={() => void shoot()}
              className="btn-pill bg-primary text-on-primary hover:bg-primary-hover disabled:opacity-60"
            >
              Take photo
            </button>
          )}
          <button type="button" onClick={onClose} className="btn-pill border-2 border-surface/60 hover:border-surface">
            {taken > 0 ? "Finish" : "Close camera"}
          </button>
        </div>
      </div>
    </section>
  );
}
