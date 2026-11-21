// The form controls every tool uses (D-046). Tools import these, never ui-sdk itself, so a change in ui-sdk (still a
// beta) is made here once. Their look is in src/styles/controls.css.
import { useId, useSyncExternalStore, type ReactElement, type ReactNode } from "react";
import { Checkbox as UiCheckbox, CheckboxIndicator } from "@ui-sdk/react/checkbox";
import { Field, FieldDescription, FieldLabel } from "@ui-sdk/react/field";
import {
  Select as UiSelect,
  SelectContent,
  SelectItem,
  SelectItemIndicator,
  SelectTrigger,
  SelectValue,
} from "@ui-sdk/react/select";
import { Tooltip, TooltipContent, TooltipShortcut, TooltipTrigger } from "@ui-sdk/react/tooltip";
import { CaretDownIcon, CheckIcon } from "~/components/icons";

export function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export interface Option<T extends string> {
  value: T;
  label: string;
}

const trigger =
  "flex min-h-11 w-full items-center justify-between gap-2 rounded-lg border-2 border-line bg-surface px-3 text-left text-base hover:border-ink/30 focus-visible:border-primary data-open:border-primary disabled:opacity-50";

/**
 * Choose one of a list. A list of our own with a mouse or trackpad; the device's own picker on a touch screen, which
 * suits a finger better than any list we could draw.
 */
export function Select<T extends string>({
  label,
  value,
  onChange,
  options,
  hideLabel = false,
  disabled = false,
  className,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: readonly Option<T>[];
  hideLabel?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const touch = useMediaQuery("(pointer: coarse)");
  const id = useId();
  const labelClass = hideLabel ? "sr-only" : "block font-semibold";
  if (touch) {
    return (
      <div className={className}>
        <label htmlFor={id} className={labelClass}>
          {label}
        </label>
        <span className="relative mt-1 block">
          <select
            id={id}
            value={value}
            disabled={disabled}
            onChange={(event) => onChange(event.target.value as T)}
            className={`${trigger} appearance-none pr-9`}
          >
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-ink-muted">
            <CaretDownIcon className="size-4" />
          </span>
        </span>
      </div>
    );
  }
  return (
    <Field {...(className && { className })}>
      <FieldLabel className={labelClass}>{label}</FieldLabel>
      <UiSelect
        items={options as Option<T>[]}
        value={value}
        disabled={disabled}
        onValueChange={(next) => next !== null && onChange(next as T)}
      >
        <SelectTrigger className={`${trigger} mt-1`}>
          <SelectValue />
          <span className="text-ink-muted">
            <CaretDownIcon className="size-4" />
          </span>
        </SelectTrigger>
        <SelectContent sideOffset={6} className="popup">
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              <span className="flex-1">{option.label}</span>
              <SelectItemIndicator className="text-primary">
                <CheckIcon className="size-4" />
              </SelectItemIndicator>
            </SelectItem>
          ))}
        </SelectContent>
      </UiSelect>
    </Field>
  );
}

/** A tick box with its label, and a line under the label when it needs explaining. */
export function Checkbox({
  checked,
  onChange,
  disabled = false,
  description,
  className,
  children,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  description?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Field className={`grid grid-cols-[auto_1fr] items-start gap-x-3 ${className ?? ""}`}>
      <UiCheckbox
        checked={checked}
        disabled={disabled}
        onCheckedChange={(next) => onChange(next === true)}
        className="checkbox"
      >
        <CheckboxIndicator>
          <CheckIcon className="size-3.5" />
        </CheckboxIndicator>
      </UiCheckbox>
      <FieldLabel className="cursor-pointer self-center data-disabled:cursor-default data-disabled:opacity-60">
        {children}
      </FieldLabel>
      {description && <FieldDescription className="col-start-2 text-sm text-ink-muted">{description}</FieldDescription>}
    </Field>
  );
}

/**
 * A short label for a button with no words of its own (an icon), shown on hover and focus. It names the button, so
 * screen readers and tests find it by this text; `shortcut` shows the keys too (like "mod+z") and sets
 * aria-keyshortcuts. The child must be one element that takes a ref and its props, like a <button>.
 */
export function Tip({
  label,
  shortcut,
  side = "bottom",
  children,
}: {
  label: string;
  shortcut?: string;
  side?: "top" | "bottom" | "left" | "right";
  children: ReactElement;
}) {
  return (
    <Tooltip type="label" delay={400} {...(shortcut && { shortcut })}>
      <TooltipTrigger render={children} />
      <TooltipContent side={side} sideOffset={6} className="popup tooltip">
        {label}
        {shortcut && (
          <span aria-hidden="true">
            <TooltipShortcut className="tooltip-keys" />
          </span>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
