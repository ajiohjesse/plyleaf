import { useId, useState } from "react";
import { engine, type CompressLevel } from "~/engine/client";
import { outputName } from "~/download/download";
import { formatSize } from "~/intake/files";
import type { ReadyDocument } from "~/intake/intake";
import { ActionBar, Choice, primaryButton } from "~/components/workspace/parts";
import { SingleFileTool, type Outcome, type ToolProps } from "~/components/workspace/SingleFileTool";

const LEVELS: { value: CompressLevel; title: string; text: string }[] = [
  { value: "low", title: "Low", text: "Lossless: nothing changes how it looks. Smallest saving." },
  { value: "recommended", title: "Recommended", text: "Images at 150 dpi. Looks the same on screen and in print." },
  { value: "extreme", title: "Extreme", text: "Images at 96 dpi. Smallest file; photos lose detail." },
];

/** The Compress PDF workspace: one PDF, a level, and the before and after sizes. */
export function CompressWorkspace() {
  return <SingleFileTool Options={CompressOptions} />;
}

/** How much smaller, as text: "1.2 MB → 340 KB, 72% smaller". */
export function sizeChange(before: number, after: number) {
  return `${formatSize(before)} → ${formatSize(after)}, ${Math.round((1 - after / before) * 100)}% smaller`;
}

async function compress(doc: ReadyDocument, level: CompressLevel): Promise<Outcome> {
  const bytes = await engine.transform(doc.info.id, { compress: level });
  // Less than 1% saved isn't worth a new file.
  if (bytes.length >= doc.size * 0.99) {
    return {
      info:
        level === "extreme"
          ? `${doc.name} is already about as small as it gets: compressing it saves nothing. Keep your original.`
          : `${doc.name} is already about as small as this level makes it. Try a stronger level, or keep your original.`,
    };
  }
  return {
    file: new Blob([bytes], { type: "application/pdf" }),
    name: outputName(doc.name, "compressed"),
    detail: sizeChange(doc.size, bytes.length),
  };
}

function CompressOptions({ doc, run, working, buttonRef }: ToolProps) {
  const [level, setLevel] = useState<CompressLevel>("recommended");
  const name = useId();
  return (
    <>
      <fieldset className="space-y-3 rounded-card border border-line bg-surface p-4">
        <legend className="px-1 font-semibold">Compression</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {LEVELS.map((option) => (
            <Choice
              key={option.value}
              name={name}
              checked={level === option.value}
              onChange={() => setLevel(option.value)}
              title={option.title}
            >
              {option.text}
            </Choice>
          ))}
        </div>
      </fieldset>
      <ActionBar status={working ? "Compressing… large files can take a minute." : `Now ${formatSize(doc.size)}`}>
        <button
          type="button"
          ref={buttonRef}
          disabled={working}
          className={primaryButton}
          onClick={() => run(() => compress(doc, level))}
        >
          {working ? "Compressing…" : "Compress PDF"}
        </button>
      </ActionBar>
    </>
  );
}
