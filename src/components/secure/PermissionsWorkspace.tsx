import { useId, useState } from "react";
import { engine, type Permission } from "~/engine/client";
import { PERMISSIONS } from "~/engine/types";
import { outputName } from "~/download/download";
import type { ReadyDocument } from "~/intake/intake";
import { PERMISSION_LABELS, restrictions } from "~/secure/permissions";
import { ActionBar, plural, primaryButton } from "~/components/workspace/parts";
import { SingleFileTool, type Outcome, type ToolProps } from "~/components/workspace/SingleFileTool";
import { PasswordField, ShowPasswords } from "./PasswordField";

/**
 * The PDF permissions workspace: choose what a PDF allows (printing, copying, editing…), with an optional password to
 * change them later. Lifting a restriction the file already had needs the same rights check as Unlock, unless the
 * owner password opened it.
 */
export function PermissionsWorkspace() {
  return <SingleFileTool Options={PermissionsOptions} />;
}

async function apply(doc: ReadyDocument, allowed: Permission[], ownerPassword: string): Promise<Outcome> {
  const bytes = await engine.transform(doc.info.id, {
    security: {
      encrypt: "aes-256",
      keepUserPassword: doc.info.unlockedWith === "user",
      permissions: allowed,
      ...(ownerPassword && { ownerPassword }),
    },
  });
  const limits = restrictions(allowed).length;
  return {
    file: new Blob([bytes], { type: "application/pdf" }),
    name: outputName(doc.name, "permissions"),
    detail: limits === 0 ? "Everything is allowed." : `${plural(limits, "thing")} not allowed.`,
  };
}

function PermissionsOptions({ doc, run, working, buttonRef }: ToolProps) {
  const [allowed, setAllowed] = useState<Permission[]>(doc.info.permissions);
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [visible, setVisible] = useState(false);
  const [rights, setRights] = useState(false);
  const ids = { rights: useId(), form: useId() };
  const toggle = (permission: Permission, on: boolean) =>
    setAllowed((list) => {
      const next = on ? [...list, permission] : list.filter((p) => p !== permission);
      // Full-quality printing needs printing.
      return PERMISSIONS.filter((p) => next.includes(p) && (p !== "print-hq" || next.includes("print")));
    });
  // Allowing something the file didn't allow takes its restrictions off: the user must have the right to.
  const lifting =
    doc.info.unlockedWith !== "owner" && restrictions(doc.info.permissions).some((p) => allowed.includes(p));
  const passwordError = password.includes(",")
    ? "Passwords can't contain a comma."
    : again !== "" && again !== password
      ? "The passwords don't match."
      : undefined;
  const ready = !working && !passwordError && (password === "" || again === password) && (!lifting || rights);

  return (
    <>
      <form
        id={ids.form}
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (ready) run(() => apply(doc, allowed, password));
        }}
      >
        <fieldset className="space-y-2 rounded-card border border-line bg-surface p-4">
          <legend className="px-1 font-semibold">Allow</legend>
          {PERMISSIONS.map((permission) => (
            <label key={permission} className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={allowed.includes(permission)}
                disabled={permission === "print-hq" && !allowed.includes("print")}
                onChange={(event) => toggle(permission, event.target.checked)}
                className="size-4 accent-primary"
              />
              {PERMISSION_LABELS[permission]}
            </label>
          ))}
          <p className="pt-2 text-sm text-ink-muted">
            Permissions are a request that most PDF apps follow, not a lock: a few apps ignore them. To keep people out,
            add a password with Protect PDF.
          </p>
        </fieldset>
        <fieldset className="space-y-3 rounded-card border border-line bg-surface p-4">
          <legend className="px-1 font-semibold">Password to change permissions (optional)</legend>
          <PasswordField
            label="Permissions password"
            value={password}
            onChange={setPassword}
            visible={visible}
            autoComplete="new-password"
            error={password.includes(",") ? passwordError : undefined}
            hint="You'll need it to change these permissions later. Leave it empty and Plyleaf sets one that nobody knows."
          />
          {password !== "" && (
            <PasswordField
              label="Type it again"
              value={again}
              onChange={setAgain}
              visible={visible}
              autoComplete="new-password"
              error={password.includes(",") ? undefined : passwordError}
            />
          )}
          <ShowPasswords checked={visible} onChange={setVisible} />
          {doc.info.unlockedWith && (
            <p className="text-sm text-ink-muted">
              {doc.info.unlockedWith === "user"
                ? "It keeps its password to open."
                : "Opened with the owner password, so its password to open isn't known: the copy will open without one."}
            </p>
          )}
        </fieldset>
        {lifting && (
          <div className="flex items-start gap-3 rounded-card border-2 border-sticky-yellow bg-surface p-4">
            <input
              id={ids.rights}
              type="checkbox"
              checked={rights}
              onChange={(event) => setRights(event.target.checked)}
              className="mt-1 size-4 accent-primary"
            />
            <label htmlFor={ids.rights}>
              I own this PDF, or have the right to remove its restrictions.
              <span className="block text-sm text-ink-muted">
                You're allowing things the file didn't. Only do that if you made it, or its maker agreed.
              </span>
            </label>
          </div>
        )}
      </form>
      <ActionBar
        status={
          working
            ? "Applying…"
            : lifting && !rights
              ? "Tick the box above to allow what the file didn't."
              : `${plural(restrictions(allowed).length, "thing")} not allowed.`
        }
      >
        <button type="submit" form={ids.form} ref={buttonRef} disabled={!ready} className={primaryButton}>
          {working ? "Applying…" : "Apply permissions"}
        </button>
      </ActionBar>
    </>
  );
}
