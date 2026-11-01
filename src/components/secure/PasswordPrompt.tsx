import { useEffect, useRef, useState } from "react";
import type { LockedDocument } from "~/intake/intake";
import { PasswordField, ShowPasswords } from "./PasswordField";

/** Asks for the password of a PDF that needs one to open. Nothing leaves the device: the engine tries it here. */
export function PasswordPrompt({ doc, onUnlock }: { doc: LockedDocument; onUnlock: (password: string) => void }) {
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLFormElement>(null);
  // The prompt comes back after each try, so a wrong password puts the cursor back in the field.
  useEffect(() => {
    ref.current?.querySelector("input")?.focus();
  }, []);
  return (
    <form
      ref={ref}
      className="space-y-3 rounded-card border-2 border-sticky-yellow bg-surface p-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (password !== "") onUnlock(password);
      }}
    >
      <p className="font-semibold">{doc.name} is protected with a password. Type it to open the file.</p>
      <PasswordField
        label="Password to open"
        value={password}
        onChange={setPassword}
        visible={visible}
        autoComplete="current-password"
        error={doc.wrongPassword ? "That password didn't open it. Check it and try again." : undefined}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ShowPasswords checked={visible} onChange={setVisible} />
        <button
          type="submit"
          disabled={password === ""}
          className="btn-pill bg-primary text-on-primary hover:bg-primary-hover disabled:opacity-60"
        >
          Open
        </button>
      </div>
    </form>
  );
}
