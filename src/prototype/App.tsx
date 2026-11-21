import { useEffect, useState } from "react";
import { FilePdfIcon, MagnifyingGlassIcon, XIcon } from "@phosphor-icons/react/ssr";
import { CompressDemo } from "./CompressDemo";
import { EditorDemo } from "./EditorDemo";
import { Palette } from "./Palette";
import { useWorkingDoc, workingDoc } from "./store";
import { Toasts, cx, isMac, useMounted } from "./ui";
import { Workbench } from "./Workbench";

type Page = "workbench" | "compress" | "editor";

export function PrototypeApp({ page }: { page: Page }) {
  const [palette, setPalette] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const workspace = page !== "workbench";

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPalette((open) => !open);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const send = (name: string) => () => window.dispatchEvent(new Event(`proto:${name}`));

  return (
    <>
      {!expanded && <Header onSearch={() => setPalette(true)} />}
      <main id="main">
        {page === "workbench" && <Workbench onSearch={() => setPalette(true)} />}
        {page === "compress" && <CompressDemo />}
        {page === "editor" && <EditorDemo expanded={expanded} onExpandedChange={setExpanded} />}
      </main>
      <Palette
        open={palette}
        onOpenChange={setPalette}
        workspace={workspace}
        onUndo={send("undo")}
        onRedo={send("redo")}
        onExpand={() => setExpanded(true)}
      />
      <Toasts />
      <PrototypeNav page={page} />
    </>
  );
}

function Header({ onSearch }: { onSearch: () => void }) {
  const doc = useWorkingDoc();
  const mounted = useMounted();
  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-surface/90 backdrop-blur">
      <nav aria-label="Main" className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-4 sm:gap-3 sm:px-6">
        <a href="/" className="mr-auto flex items-center gap-2 rounded-md font-display text-xl font-extrabold">
          <span
            className="grid size-8 -rotate-6 place-items-center rounded-lg bg-sticky-yellow shadow-sticky"
            aria-hidden="true"
          >
            <FilePdfIcon weight="bold" className="size-5" />
          </span>
          <span className="max-sm:sr-only">Plyleaf</span>
        </a>
        {doc && (
          <span className="settle flex h-10 min-w-0 items-center gap-1 rounded-pill border-2 border-primary/30 bg-sticky-lavender/25 pr-1 pl-3 text-sm [--settle-from:0deg]">
            <a href="/prototype/workbench" className="flex min-w-0 items-center gap-2 font-semibold hover:underline">
              <FilePdfIcon weight="duotone" className="size-4.5 shrink-0 text-primary" aria-hidden="true" />
              <span className="max-w-[9rem] truncate sm:max-w-[14rem]">
                <span className="max-md:sr-only">Working on </span>
                {doc.name}
              </span>
            </a>
            <button
              type="button"
              onClick={() => workingDoc.close()}
              aria-label={`Close ${doc.name}`}
              className="press grid size-8 place-items-center rounded-full hover:bg-ink/10"
            >
              <XIcon weight="bold" className="size-4" aria-hidden="true" />
            </button>
          </span>
        )}
        <button
          type="button"
          onClick={onSearch}
          className="press flex h-10 items-center gap-2 rounded-pill border-2 border-line px-3 text-ink-muted hover:border-ink/25 hover:text-ink sm:min-w-56"
        >
          <MagnifyingGlassIcon weight="bold" className="size-4.5" aria-hidden="true" />
          <span className="max-sm:sr-only">Find a tool…</span>
          <kbd className="ml-auto hidden rounded-md border border-line bg-surface-band px-1.5 text-xs font-semibold sm:block">
            {mounted && isMac() ? "⌘K" : "Ctrl K"}
          </kbd>
        </button>
      </nav>
    </header>
  );
}

/** Only for the prototype: jump between the screens under review. */
function PrototypeNav({ page }: { page: Page }) {
  const pages: [Page, string][] = [
    ["workbench", "Workbench"],
    ["compress", "Tool page"],
    ["editor", "Editor"],
  ];
  return (
    <nav
      aria-label="Prototype screens"
      className="fixed top-20 right-3 z-30 hidden flex-col gap-1 rounded-2xl border border-dashed border-ink/30 bg-surface/95 p-2 text-sm shadow-sticky xl:flex"
    >
      <span className="px-2 text-xs font-bold tracking-wide text-ink-muted uppercase">Prototype</span>
      {pages.map(([name, label]) => (
        <a
          key={name}
          href={`/prototype/${name}`}
          aria-current={name === page ? "page" : undefined}
          className={cx(
            "rounded-lg px-2 py-1 font-semibold hover:bg-surface-band",
            name === page && "bg-sticky-yellow",
          )}
        >
          {label}
        </a>
      ))}
    </nav>
  );
}
