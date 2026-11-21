// A tool page in the new layout: carrying the working document (D-045), or a one-off job when there isn't one.
import { useState } from "react";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  DownloadSimpleIcon,
  FilePdfIcon,
  GaugeIcon,
  PushPinIcon,
  StackIcon,
  UploadSimpleIcon,
} from "@phosphor-icons/react/ssr";
import { MockPage } from "./MockPage";
import { formatSize, useWorkingDoc, workingDoc } from "./store";
import { Check, RadioCards, cx, toast, useMounted } from "./ui";

const LEVELS = [
  { value: "low", label: "Low", description: "Nothing you can see changes.", ratio: 0.92 },
  {
    value: "recommended",
    label: "Recommended",
    description: "Images at 150 dpi. Right for nearly everything.",
    ratio: 0.41,
    badge: "Best",
  },
  { value: "extreme", label: "Extreme", description: "The smallest file. Images at 96 dpi.", ratio: 0.24 },
];

export function CompressDemo() {
  const doc = useWorkingDoc();
  const mounted = useMounted();
  const [oneOff, setOneOff] = useState(false);
  const [level, setLevel] = useState("recommended");
  const [metadata, setMetadata] = useState(false);
  const [state, setState] = useState<"idle" | "working" | "done">("idle");
  const file = doc
    ? { name: doc.name, size: doc.steps[doc.at - 1]!.size, pages: doc.pages }
    : oneOff
      ? { name: "invoice-march.pdf", size: 2_310_000, pages: 2 }
      : null;
  const ratio = LEVELS.find((l) => l.value === level)!.ratio;

  function compress() {
    setState("working");
    window.setTimeout(() => setState("done"), 900);
  }

  return (
    <>
      <section className="border-b border-line bg-sticky-mint/30">
        <div className="mx-auto max-w-6xl px-4 pt-6 pb-10 sm:px-6 sm:pt-10">
          {doc && (
            <a
              href="/prototype/workbench"
              className="press mb-4 inline-flex items-center gap-1.5 rounded-pill bg-surface/70 px-3 py-1.5 text-sm font-semibold hover:bg-surface"
            >
              <ArrowLeftIcon weight="bold" className="size-4" aria-hidden="true" /> Workbench
            </a>
          )}
          <div className="flex items-center gap-3 sm:gap-4">
            <span
              className="grid size-11 shrink-0 -rotate-3 place-items-center rounded-xl bg-sticky-mint shadow-sticky sm:size-14"
              aria-hidden="true"
            >
              <GaugeIcon weight="duotone" className="size-6 sm:size-8" />
            </span>
            <h1 className="text-3xl sm:text-5xl">Compress PDF</h1>
          </div>
          {!file && (
            <p className="mt-4 max-w-2xl text-lg">
              Make a PDF smaller to email or upload. Free, no sign-up, and your file never leaves this device.
            </p>
          )}

          <div className="mt-6 sm:mt-8">
            {!mounted ? null : !file ? (
              <div className="grid place-items-center gap-4 rounded-[28px] border-[3px] border-dashed border-ink/20 bg-surface px-6 py-12 text-center">
                <p className="font-display text-2xl font-extrabold">Drop a PDF here</p>
                <button
                  type="button"
                  onClick={() => setOneOff(true)}
                  className="btn-pill press bg-primary text-on-primary hover:bg-primary-hover"
                >
                  <UploadSimpleIcon weight="bold" className="size-5" aria-hidden="true" /> Choose a PDF
                </button>
              </div>
            ) : state === "done" ? (
              <Done
                name={file.name}
                before={file.size}
                after={Math.round(file.size * ratio)}
                carried={Boolean(doc)}
                onAgain={() => setState("idle")}
              />
            ) : (
              <div className="grid gap-4 lg:grid-cols-[1fr_22rem] lg:items-start">
                <div className="rounded-[24px] border border-line bg-surface p-4 sm:p-5">
                  <div className="flex items-center gap-3">
                    <FilePdfIcon weight="duotone" className="size-8 shrink-0 text-primary" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{file.name}</p>
                      <p className="text-sm text-ink-muted">
                        {file.pages} pages · {formatSize(file.size)}
                        {doc && doc.at > 1 && ` · after ${doc.at - 1} ${doc.at === 2 ? "step" : "steps"}`}
                      </p>
                    </div>
                    {doc ? (
                      <span className="hidden items-center gap-1 rounded-pill bg-sticky-lavender/40 px-2.5 py-1 text-xs font-bold sm:flex">
                        <StackIcon weight="bold" className="size-3.5" aria-hidden="true" /> Working document
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-4 hidden grid-cols-3 gap-3 sm:grid sm:grid-cols-6 max-sm:[&>*:nth-child(n+4)]:hidden">
                    {Array.from({ length: Math.min(6, file.pages) }, (_, i) => (
                      <MockPage key={i} n={i + 1} />
                    ))}
                  </div>
                </div>

                <div className="grid gap-4 rounded-[24px] border border-line bg-surface p-4 sm:p-5 lg:sticky lg:top-24">
                  <RadioCards label="Strength" value={level} onChange={setLevel} options={LEVELS} stack />
                  <Check
                    label="Also remove document properties"
                    description="Title, author and the app that made it."
                    checked={metadata}
                    onChange={setMetadata}
                  />
                  <div className="sticky bottom-3 -mx-1 flex items-center justify-between gap-3 rounded-2xl bg-surface-band px-3 py-2.5 lg:static">
                    <p className="text-sm">
                      About <strong className="tabular-nums">{formatSize(file.size * ratio)}</strong>
                      <span className="text-ink-muted"> from {formatSize(file.size)}</span>
                    </p>
                    <button
                      type="button"
                      onClick={compress}
                      disabled={state === "working"}
                      className="btn-pill press bg-primary px-5 text-on-primary hover:bg-primary-hover disabled:opacity-70"
                    >
                      {state === "working" ? "Compressing…" : "Compress"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-3xl px-4 py-12 text-center text-ink-muted sm:px-6">
        How it works, questions and related tools stay below, as today.
      </section>
    </>
  );
}

const BITS = [
  { dx: "-70px", dy: "-50px", spin: "-40deg", c: "bg-sticky-yellow", s: "size-3 rounded-sm" },
  { dx: "60px", dy: "-64px", spin: "60deg", c: "bg-sticky-pink", s: "size-2.5 rounded-full" },
  { dx: "90px", dy: "-10px", spin: "90deg", c: "bg-sticky-lavender", s: "size-3 rotate-45" },
  { dx: "-96px", dy: "4px", spin: "-80deg", c: "bg-sticky-mint", s: "size-2.5 rounded-full" },
  { dx: "-30px", dy: "-80px", spin: "20deg", c: "bg-primary", s: "size-2 rounded-full" },
  { dx: "34px", dy: "-86px", spin: "-30deg", c: "bg-sticky-coral", s: "size-2.5 rounded-sm" },
];

function Done({
  name,
  before,
  after,
  carried,
  onAgain,
}: {
  name: string;
  before: number;
  after: number;
  carried: boolean;
  onAgain: () => void;
}) {
  const saved = Math.round((1 - after / before) * 100);
  return (
    <div className="grid justify-items-center py-4">
      <div className="relative">
        <div className="burst pointer-events-none absolute top-8 left-1/2" aria-hidden="true">
          {BITS.map((bit, i) => (
            <span
              key={i}
              className={cx("absolute", bit.c, bit.s)}
              style={{
                ["--dx" as string]: bit.dx,
                ["--dy" as string]: bit.dy,
                ["--spin" as string]: bit.spin,
                animationDelay: "180ms",
              }}
            />
          ))}
        </div>
        <div className="settle w-[min(26rem,calc(100vw-2rem))] rounded-[24px] border border-line bg-surface p-6 text-center shadow-sticky [--settle-from:-3deg]">
          <p className="font-display text-3xl font-extrabold">{saved}% smaller</p>
          <p className="mt-1 text-ink-muted">
            {formatSize(before)} → <strong className="text-ink">{formatSize(after)}</strong>
          </p>
          <div className="mt-6 grid gap-2">
            {carried ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    workingDoc.apply("compress-pdf", "Compressed", after);
                    window.location.href = "/prototype/workbench";
                  }}
                  className="btn-pill press bg-primary text-on-primary hover:bg-primary-hover"
                >
                  Continue with another tool <ArrowRightIcon weight="bold" className="size-5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => toast(`Downloading ${name}`)}
                  className="btn-pill press border-2 border-line hover:border-ink/25"
                >
                  <DownloadSimpleIcon weight="bold" className="size-5" aria-hidden="true" /> Download
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => toast(`Downloading ${name}`)}
                  className="btn-pill press bg-primary text-on-primary hover:bg-primary-hover"
                >
                  <DownloadSimpleIcon weight="bold" className="size-5" aria-hidden="true" /> Download
                </button>
                <button
                  type="button"
                  onClick={() => {
                    workingDoc.open(name);
                    workingDoc.apply("compress-pdf", "Compressed", after);
                    window.location.href = "/prototype/workbench";
                  }}
                  className="btn-pill press border-2 border-line hover:border-ink/25"
                >
                  <PushPinIcon weight="bold" className="size-5" aria-hidden="true" /> Make this my working document
                </button>
              </>
            )}
            <button
              type="button"
              onClick={onAgain}
              className="mt-1 text-sm font-semibold text-ink-muted hover:text-ink"
            >
              Try another strength
            </button>
          </div>
        </div>
      </div>
      <p className="mt-6 text-sm text-ink-muted">
        Plyleaf is free because it runs on your device.{" "}
        <a className="font-semibold underline" href="/">
          ♥ Support it
        </a>
      </p>
    </div>
  );
}
