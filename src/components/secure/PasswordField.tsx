import { useId } from "react";

interface Props {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Shown as text rather than dots. */
  visible: boolean;
  /** "new-password" for a password being set, so password managers offer to save it; "current-password" to open. */
  autoComplete: "new-password" | "current-password";
  error?: string | undefined;
  hint?: string;
}

/** A password input with its label, hint and error, described for screen readers. */
export function PasswordField({ label, value, onChange, visible, autoComplete, error, hint }: Props) {
  const id = useId();
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ");
  return (
    <div>
      <label htmlFor={id} className="font-semibold">
        {label}
      </label>
      <input
        id={id}
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        spellCheck={false}
        autoCapitalize="off"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className="mt-1 block w-full rounded-lg border-2 border-line bg-surface px-3 py-2 text-base focus:border-primary focus:outline-none aria-invalid:border-sticky-coral"
      />
      {hint && (
        <p id={`${id}-hint`} className="mt-1 text-sm text-ink-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="mt-1 text-sm font-semibold">
          {error}
        </p>
      )}
    </div>
  );
}

/** Why a new password can't be used, or undefined when it can. */
export function newPasswordProblem(password: string): string | undefined {
  if (password === "") return "Type a password.";
  if (password.includes(",")) return "Passwords can't contain a comma.";
  return undefined;
}

export function ShowPasswords({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  const id = useId();
  return (
    <div className="flex items-center gap-2">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-4 accent-primary"
      />
      <label htmlFor={id}>Show passwords</label>
    </div>
  );
}
