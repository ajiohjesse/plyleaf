import { useId, useState } from "react";
import { engine } from "~/engine/client";
import { outputName } from "~/download/download";
import type { ReadyDocument } from "~/intake/intake";
import { PERMISSION_LABELS, restrictions } from "~/secure/permissions";
import { ActionBar, primaryButton } from "~/components/workspace/parts";
import { SingleFileTool, type Outcome, type ToolProps } from "~/components/workspace/SingleFileTool";

/**
 * The Unlock PDF workspace: a PDF opened with its password comes out without one. Restrictions (on printing,
 * copying…) are removed only once the user confirms they have the right to (owner decision, 2026-11-01), unless the
 * owner password opened it.
 */
export function UnlockWorkspace() {
  return <SingleFileTool Options={UnlockOptions} />;
}

async function unlock(doc: ReadyDocument): Promise<Outcome> {
  const bytes = await engine.transform(doc.info.id, { security: { encrypt: "none" } });
  return {
    file: new Blob([bytes], { type: "application/pdf" }),
    name: outputName(doc.name, "unlocked"),
    detail: "No password and no restrictions.",
  };
}

function UnlockOptions({ doc, run, working, buttonRef }: ToolProps) {
  const [rights, setRights] = useState(false);
  const rightsId = useId();
  const { encryption, unlockedWith, permissions } = doc.info;
  const limits = restrictions(permissions);

  if (!encryption) {
    return (
      <p className="rounded-card border border-line bg-surface px-4 py-3">
        {doc.name} isn't protected: it has no password and no restrictions, so there's nothing to unlock.
      </p>
    );
  }

  const label = unlockedWith ? "Remove password" : "Remove restrictions";
  return (
    <>
      <div className="space-y-3 rounded-card border border-line bg-surface p-4">
        <p>
          {unlockedWith
            ? `Opened with ${unlockedWith === "owner" ? "the owner" : "its"} password. The copy you download won't need one.`
            : `${doc.name} opens without a password, but it has restrictions.`}
        </p>
        {limits.length > 0 && (
          <>
            <div>
              <p className="font-semibold">It doesn't allow:</p>
              <ul className="mt-1 list-disc pl-6 text-ink-muted" aria-label="Restrictions">
                {limits.map((permission) => (
                  <li key={permission}>{PERMISSION_LABELS[permission]}</li>
                ))}
              </ul>
            </div>
            <div className="flex items-start gap-3">
              <input
                id={rightsId}
                type="checkbox"
                checked={rights}
                onChange={(event) => setRights(event.target.checked)}
                className="mt-1 size-4 accent-primary"
              />
              <label htmlFor={rightsId}>
                I own this PDF, or have the right to remove its restrictions.
                <span className="block text-sm text-ink-muted">
                  Restrictions are set by whoever made the file. Only remove them if that's you, or they've agreed.
                </span>
              </label>
            </div>
          </>
        )}
      </div>
      <ActionBar
        status={
          working
            ? "Unlocking…"
            : limits.length > 0 && !rights
              ? "Tick the box above to remove the restrictions."
              : "The copy opens and works without any password."
        }
      >
        <button
          type="button"
          ref={buttonRef}
          disabled={working || (limits.length > 0 && !rights)}
          className={primaryButton}
          onClick={() => run(() => unlock(doc))}
        >
          {working ? "Unlocking…" : label}
        </button>
      </ActionBar>
    </>
  );
}
