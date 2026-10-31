import type { IntakeOptions } from "~/intake/files";
import { DocumentList, IntakeNotices } from "~/components/intake/IntakePanel";
import { FileDrop } from "~/components/intake/FileDrop";
import { useIntake } from "~/components/intake/useIntake";
import { ThumbnailGrid } from "./ThumbnailGrid";

/**
 * File intake with every open document's pages below it. It's what the thumbnails harness shows until the first tool
 * workspace (M2) takes these pieces over.
 */
export function PagesPanel(options: IntakeOptions) {
  const [state, intake] = useIntake(options);
  const ready = state.documents.filter((doc) => doc.status === "ready");
  return (
    <div className="space-y-6" data-busy={state.busy || undefined}>
      <DocumentList state={state} intake={intake} />
      <FileDrop
        onFiles={(files) => void intake.add(files)}
        compact={state.documents.length > 0}
        {...(options.accept && { accept: options.accept })}
        {...(options.multiple !== undefined && { multiple: options.multiple })}
      />
      <IntakeNotices state={state} intake={intake} />
      {ready.map((doc) => (
        <section key={doc.key} className="space-y-3">
          <h2 className="font-display text-xl font-extrabold">{doc.name}</h2>
          <ThumbnailGrid doc={doc.info} label={`Pages of ${doc.name}`} />
        </section>
      ))}
    </div>
  );
}
