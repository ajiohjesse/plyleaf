import { useId, useState } from "react";
import { engine } from "~/engine/client";
import { outputName } from "~/download/download";
import type { ReadyDocument } from "~/intake/intake";
import { ActionBar, primaryButton } from "~/components/workspace/parts";
import { SingleFileTool, type Outcome, type ToolProps } from "~/components/workspace/SingleFileTool";
import { newPasswordProblem, PasswordField, ShowPasswords } from "./PasswordField";

/** The Protect PDF workspace: one PDF, a password to open it, AES-256. */
export function ProtectWorkspace() {
  return <SingleFileTool Options={ProtectOptions} />;
}

async function protect(doc: ReadyDocument, password: string): Promise<Outcome> {
  const bytes = await engine.transform(doc.info.id, {
    // A file that already had restrictions keeps them.
    security: { encrypt: "aes-256", userPassword: password, permissions: doc.info.permissions },
  });
  return {
    file: new Blob([bytes], { type: "application/pdf" }),
    name: outputName(doc.name, "protected"),
    detail: "Encrypted with AES-256. It opens only with your password.",
  };
}

function ProtectOptions({ doc, run, working, buttonRef }: ToolProps) {
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [visible, setVisible] = useState(false);
  // Errors show once the user has tried to protect, or has typed the second password.
  const [tried, setTried] = useState(false);
  const formId = useId();
  const problem = newPasswordProblem(password);
  const mismatch = password !== again ? "The passwords don't match." : undefined;

  return (
    <>
      <form
        className="space-y-4 rounded-card border border-line bg-surface p-4"
        onSubmit={(event) => {
          event.preventDefault();
          setTried(true);
          if (!problem && !mismatch) run(() => protect(doc, password));
        }}
        id={formId}
      >
        <PasswordField
          label="Password"
          value={password}
          onChange={setPassword}
          visible={visible}
          autoComplete="new-password"
          error={tried || password.includes(",") ? problem : undefined}
          hint="Anyone opening the PDF will need it. Plyleaf can't recover it for you, so keep it somewhere safe."
        />
        <PasswordField
          label="Type it again"
          value={again}
          onChange={setAgain}
          visible={visible}
          autoComplete="new-password"
          error={tried || (again !== "" && again.length >= password.length) ? mismatch : undefined}
        />
        <ShowPasswords checked={visible} onChange={setVisible} />
        {doc.info.encryption && (
          <p className="text-sm text-ink-muted">
            This PDF already has restrictions on what can be done with it. They stay, with your password added.
          </p>
        )}
      </form>
      <ActionBar status={working ? "Encrypting…" : "AES-256, the strongest encryption PDF has."}>
        <button type="submit" form={formId} ref={buttonRef} disabled={working} className={primaryButton}>
          {working ? "Protecting…" : "Protect PDF"}
        </button>
      </ActionBar>
    </>
  );
}
