// The Workbench (D-045): the working document, its steps, what to apply next and the download.
import { useState } from "react";
import {
  ArrowArcLeftIcon,
  ArrowCounterClockwiseIcon,
  ArrowsMergeIcon,
  CheckIcon,
  ClockCounterClockwiseIcon,
  DownloadSimpleIcon,
  FilePdfIcon,
  MagnifyingGlassIcon,
  ShieldCheckIcon,
  SwapIcon,
  UploadSimpleIcon,
} from "@phosphor-icons/react/ssr";
import { categories, tools } from "~/data/tools";
import { stickyBg } from "~/components/sticky";
import { MockPage } from "./MockPage";
import { ToolIcon, roleOf } from "./icons";
import { prototypePages } from "./Palette";
import { formatSize, useWorkingDoc, workingDoc, type WorkingDoc } from "./store";
import { cx, toast, useMounted } from "./ui";

export function Workbench({ onSearch }: { onSearch: () => void }) {
  const doc = useWorkingDoc();
  const mounted = useMounted();
  if (!mounted) return <div className="min-h-[70dvh]" />;
  return doc ? <Bench doc={doc} onSearch={onSearch} /> : <Start />;
}

function useDropCatch(onDrop: () => void) {
  const [over, setOver] = useState(false);
  const [caught, setCaught] = useState(0);
  return {
    over,
    caught,
    props: {
      onDragOver: (event: React.DragEvent) => {
        event.preventDefault();
        setOver(true);
      },
      onDragLeave: () => setOver(false),
      onDrop: (event: React.DragEvent) => {
        event.preventDefault();
        setOver(false);
        setCaught((n) => n + 1);
        window.setTimeout(onDrop, 280);
      },
    },
  };
}

function Start() {
  const drop = useDropCatch(() => workingDoc.open());
  return (
    <section className="bg-sticky-lavender/25">
      <div className="mx-auto max-w-3xl px-4 pt-10 pb-16 sm:px-6 sm:pt-16">
        <h1 className="text-4xl sm:text-6xl">Workbench</h1>
        <p className="mt-4 max-w-xl text-lg">
          Drop a PDF once, then apply as many tools as you like, one after another. Download when it's just right.
        </p>
        <div
          {...drop.props}
          key={drop.caught}
          className={cx(
            "mt-8 grid place-items-center gap-4 rounded-[28px] border-[3px] border-dashed bg-surface px-6 py-14 text-center transition-colors",
            drop.over ? "border-primary bg-sticky-lavender/30" : "border-ink/20",
            drop.caught > 0 && "catch",
          )}
        >
          <span className="settle grid size-16 -rotate-6 place-items-center rounded-2xl bg-sticky-yellow shadow-sticky">
            <FilePdfIcon weight="duotone" className="size-9" aria-hidden="true" />
          </span>
          <p className="font-display text-2xl font-extrabold">Drop a PDF to start</p>
          <button
            type="button"
            onClick={() => workingDoc.open()}
            className="btn-pill press bg-primary text-on-primary hover:bg-primary-hover"
          >
            <UploadSimpleIcon weight="bold" className="size-5" aria-hidden="true" /> Choose a PDF
          </button>
          <p className="flex items-center gap-1.5 text-sm text-ink-muted">
            <ShieldCheckIcon weight="fill" className="size-4 text-[#1f8a5b]" aria-hidden="true" />
            Stays on this device. Nothing is uploaded.
          </p>
        </div>
      </div>
    </section>
  );
}

function Bench({ doc, onSearch }: { doc: WorkingDoc; onSearch: () => void }) {
  const current = doc.steps[doc.at - 1]!;
  const [dropped, setDropped] = useState(false);
  const drop = useDropCatch(() => setDropped(true));

  function apply(slug: string) {
    const tool = tools.find((t) => t.slug === slug)!;
    if (prototypePages[slug]) {
      window.location.assign(prototypePages[slug]!);
      return;
    }
    if (roleOf(slug) === "ends") {
      toast(`${tool.name} would download its files; your working document stays as it is`);
      return;
    }
    // The real flow opens the tool's page with the working document; the prototype pretends it ran.
    workingDoc.apply(slug, tool.name, Math.round(current.size * 0.93));
  }

  function replace() {
    const before = doc;
    setDropped(false);
    workingDoc.open("contract-v2.pdf");
    toast("Replaced with contract-v2.pdf", {
      duration: 6000,
      action: { label: "Undo", onAction: () => workingDoc.restore(before) },
    });
  }

  return (
    <div {...drop.props} className="min-h-[calc(100dvh-4rem)] bg-surface-band">
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[22rem_1fr] lg:py-10">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div
            key={drop.caught}
            className={cx("rounded-[24px] border border-line bg-surface p-5 shadow-sticky", drop.caught > 0 && "catch")}
          >
            <div className="flex gap-4">
              <div className="relative w-20 shrink-0">
                <div className="absolute inset-0 translate-x-2 -translate-y-1 rotate-6 opacity-70">
                  <MockPage n={3} />
                </div>
                <div className="absolute inset-0 translate-x-1 rotate-3 opacity-85">
                  <MockPage n={2} />
                </div>
                <MockPage n={1} />
              </div>
              <div className="min-w-0">
                <h1 className="truncate font-sans text-lg font-bold tracking-normal">{doc.name}</h1>
                <p className="text-sm text-ink-muted">
                  {doc.pages} pages · {formatSize(current.size)}
                </p>
                <p className="mt-1 text-sm text-ink-muted">
                  {doc.at === 1 ? "As you added it" : `After ${doc.at - 1} ${doc.at === 2 ? "step" : "steps"}`}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => toast(`Downloading ${doc.name}`)}
              className="btn-pill press mt-5 w-full bg-primary text-on-primary hover:bg-primary-hover"
            >
              <DownloadSimpleIcon weight="bold" className="size-5" aria-hidden="true" /> Download
            </button>
            {dropped && (
              <div className="settle mt-4 rounded-2xl border-2 border-primary/30 bg-sticky-lavender/25 p-3 [--settle-from:0deg]">
                <p className="text-sm font-semibold">You dropped contract-v2.pdf</p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={replace}
                    className="btn-pill press min-h-9 flex-1 border-2 border-line bg-surface px-3 text-sm"
                  >
                    <SwapIcon weight="bold" className="size-4" aria-hidden="true" /> Replace
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDropped(false);
                      workingDoc.apply("merge-pdf", "Merged with contract-v2.pdf", current.size + 1_200_000);
                    }}
                    className="btn-pill press min-h-9 flex-1 bg-ink px-3 text-sm text-surface"
                  >
                    <ArrowsMergeIcon weight="bold" className="size-4" aria-hidden="true" /> Merge into it
                  </button>
                </div>
              </div>
            )}
          </div>

          <section aria-labelledby="steps-heading" className="mt-4 rounded-[24px] border border-line bg-surface p-5">
            <div className="flex items-center justify-between">
              <h2 id="steps-heading" className="font-sans text-base font-bold tracking-normal">
                Steps
              </h2>
              <button
                type="button"
                disabled={doc.at === 1}
                onClick={() => workingDoc.goTo(doc.at - 1)}
                className="press flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-sm font-semibold text-primary hover:bg-primary/10 disabled:text-ink-muted disabled:opacity-50"
              >
                <ArrowCounterClockwiseIcon weight="bold" className="size-4" aria-hidden="true" /> Undo last step
              </button>
            </div>
            <ol className="mt-3 grid">
              {doc.steps.map((step, i) => {
                const applied = i < doc.at;
                const isCurrent = i === doc.at - 1;
                return (
                  <li key={step.id} className={cx("step-in relative pl-8", !applied && "opacity-50")}>
                    <span
                      className={cx(
                        "absolute top-2.5 left-0 grid size-6 place-items-center rounded-full border-2 text-xs font-bold",
                        isCurrent
                          ? "border-primary bg-primary text-on-primary"
                          : applied
                            ? "border-primary/40 bg-surface text-primary"
                            : "border-line bg-surface",
                      )}
                      aria-hidden="true"
                    >
                      {isCurrent ? <CheckIcon weight="bold" className="size-3.5" /> : i + 1}
                    </span>
                    {i < doc.steps.length - 1 && (
                      <span className="absolute top-8 bottom-0 left-[11px] w-0.5 bg-line" aria-hidden="true" />
                    )}
                    <button
                      type="button"
                      onClick={() => workingDoc.goTo(i + 1)}
                      aria-current={isCurrent ? "step" : undefined}
                      className="press flex w-full items-center justify-between gap-2 rounded-xl px-2 py-2 text-left hover:bg-surface-band"
                    >
                      <span className={cx("font-semibold", !applied && "line-through")}>{step.label}</span>
                      <span className="text-sm text-ink-muted tabular-nums">{formatSize(step.size)}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
            <p className="mt-3 flex gap-2 text-xs text-ink-muted">
              <ClockCounterClockwiseIcon weight="bold" className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              Every step is kept on this device so you can go back. It's all cleared when you close the file, or 24
              hours after you last use it.
            </p>
          </section>
        </aside>

        <section aria-labelledby="next-heading">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 id="next-heading" className="text-3xl sm:text-4xl">
              What next?
            </h2>
            <button
              type="button"
              onClick={onSearch}
              className="press flex h-11 items-center gap-2 rounded-pill border-2 border-line bg-surface px-4 text-ink-muted hover:border-ink/25 hover:text-ink"
            >
              <MagnifyingGlassIcon weight="bold" className="size-4.5" aria-hidden="true" /> Search tools
            </button>
          </div>
          {doc.at < doc.steps.length && (
            <p className="mt-3 flex items-center gap-2 rounded-xl bg-sticky-yellow/40 px-3 py-2 text-sm">
              <ArrowArcLeftIcon weight="bold" className="size-4" aria-hidden="true" />
              You went back a step. Applying a tool now replaces the steps after this one.
            </p>
          )}
          <div className="mt-6 grid gap-8">
            {categories.map((category, ci) => {
              const list = tools.filter((t) => t.category === category.id && t.available && roleOf(t.slug) !== "start");
              if (list.length === 0) return null;
              return (
                <div key={category.id}>
                  <h3 className="flex items-center gap-2 font-sans text-sm font-bold tracking-wide text-ink-muted uppercase">
                    <span className={cx("size-3 rounded-sm", stickyBg[category.sticky])} aria-hidden="true" />
                    {category.name}
                  </h3>
                  <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                    {list.map((tool, i) => (
                      <li
                        key={tool.slug}
                        className="settle"
                        style={{
                          animationDelay: `${ci * 60 + i * 25}ms`,
                          ["--settle-from" as string]: `${i % 2 ? 2 : -2}deg`,
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => apply(tool.slug)}
                          className="press group flex h-full w-full items-center gap-3 rounded-2xl border border-line bg-surface p-3 text-left hover:-translate-y-0.5 hover:border-ink/20 hover:shadow-sticky"
                        >
                          <span
                            className={cx(
                              "grid size-10 shrink-0 place-items-center rounded-xl transition-transform group-hover:-rotate-6",
                              stickyBg[category.sticky],
                            )}
                          >
                            <ToolIcon slug={tool.slug} className="size-5.5" />
                          </span>
                          <span className="min-w-0">
                            <span className="block leading-tight font-semibold">{tool.name}</span>
                            {roleOf(tool.slug) === "ends" && (
                              <span className="text-xs text-ink-muted">Downloads files</span>
                            )}
                            {tool.slug === "merge-pdf" && (
                              <span className="text-xs text-ink-muted">Add more files</span>
                            )}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
