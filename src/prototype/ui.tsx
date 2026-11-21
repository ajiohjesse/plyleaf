/* oxlint-disable jsx-a11y/label-has-associated-control -- the label wraps a ui-sdk Radio button */
// Preview of the shared wrappers D-046 puts in src/components/workspace/: tools use these, never ui-sdk directly.
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { CaretDownIcon, CaretLeftIcon, CaretRightIcon, CaretUpIcon, CheckIcon } from "@phosphor-icons/react/ssr";
import { Checkbox, CheckboxIndicator } from "@ui-sdk/react/checkbox";
import { Dialog, DialogBackdrop, DialogContent, DialogTitle } from "@ui-sdk/react/dialog";
import { Drawer, DrawerBackdrop, DrawerContent, DrawerHandle, DrawerTitle } from "@ui-sdk/react/drawer";
import { Field, FieldDescription, FieldLabel } from "@ui-sdk/react/field";
import { Radio, RadioGroup, RadioIndicator } from "@ui-sdk/react/radio";
import {
  Select as UiSelect,
  SelectContent,
  SelectItem,
  SelectItemIndicator,
  SelectTrigger,
  SelectValue,
} from "@ui-sdk/react/select";
import { Toast, ToastAction, ToastRegion, ToastTitle, toast } from "@ui-sdk/react/toast";
import { Tooltip, TooltipContent, TooltipShortcut, TooltipTrigger } from "@ui-sdk/react/tooltip";

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

export const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(" ");

/** An icon-only button named by its tooltip, with the keys that do the same thing. */
export function IconButton({
  label,
  shortcut,
  pressed,
  disabled,
  onClick,
  side = "bottom",
  className,
  children,
}: {
  label: string;
  shortcut?: string;
  pressed?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
  children: ReactNode;
}) {
  return (
    <Tooltip type="label" delay={400} {...(shortcut && { shortcut })}>
      <TooltipTrigger
        aria-pressed={pressed}
        aria-disabled={disabled || undefined}
        onClick={disabled ? undefined : onClick}
        className={cx(
          "press grid size-10 shrink-0 place-items-center rounded-xl text-ink-muted hover:bg-ink/8 hover:text-ink aria-disabled:opacity-35 aria-disabled:hover:bg-transparent aria-pressed:bg-primary aria-pressed:text-on-primary aria-pressed:shadow-sm [&_svg]:size-5",
          className,
        )}
      >
        {children}
      </TooltipTrigger>
      <TooltipContent side={side} sideOffset={6} className="pop z-50">
        {label}
        {shortcut && <TooltipShortcut />}
      </TooltipContent>
    </Tooltip>
  );
}

export interface Option {
  value: string;
  label: string;
}

/** A custom list with a pointer; the phone's own picker on touch screens. */
export function Select({
  label,
  value,
  onChange,
  options,
  hideLabel = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  hideLabel?: boolean;
}) {
  const coarse = useMediaQuery("(pointer: coarse)");
  const trigger =
    "flex min-h-11 w-full items-center justify-between gap-2 rounded-xl border-2 border-line bg-surface px-3 text-left font-medium hover:border-ink/30 data-open:border-primary";
  if (coarse) {
    return (
      <label className="grid gap-1.5">
        <span className={cx("text-sm font-semibold", hideLabel && "sr-only")}>{label}</span>
        <span className="relative">
          <select
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className={cx(trigger, "appearance-none pr-9")}
          >
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <CaretDownIcon
            weight="bold"
            className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2"
          />
        </span>
      </label>
    );
  }
  return (
    <Field className="grid gap-1.5">
      <FieldLabel className={cx("text-sm font-semibold", hideLabel && "sr-only")}>{label}</FieldLabel>
      <UiSelect items={options} value={value} onValueChange={(next) => next && onChange(next as string)}>
        <SelectTrigger className={trigger}>
          <SelectValue />
          <CaretDownIcon weight="bold" className="size-4 text-ink-muted" aria-hidden="true" />
        </SelectTrigger>
        <SelectContent className="pop z-50" sideOffset={6}>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              <span className="flex-1">{option.label}</span>
              <SelectItemIndicator>
                <CheckIcon weight="bold" className="size-4 text-primary" aria-hidden="true" />
              </SelectItemIndicator>
            </SelectItem>
          ))}
        </SelectContent>
      </UiSelect>
    </Field>
  );
}

export function Check({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <Field className="grid cursor-pointer grid-cols-[auto_1fr] items-start gap-x-3 gap-y-0.5 py-1">
      <Checkbox checked={checked} onCheckedChange={(next) => onChange(next === true)} className="mt-0.5">
        <CheckboxIndicator>
          <CheckIcon weight="bold" className="size-3.5" aria-hidden="true" />
        </CheckboxIndicator>
      </Checkbox>
      <FieldLabel className="cursor-pointer font-medium">{label}</FieldLabel>
      {description && <FieldDescription className="col-start-2 text-sm text-ink-muted">{description}</FieldDescription>}
    </Field>
  );
}

export function RadioCards({
  label,
  value,
  onChange,
  options,
  stack = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: (Option & { description: string; badge?: string })[];
  stack?: boolean;
}) {
  return (
    <Field className="grid gap-2">
      <FieldLabel className="text-sm font-semibold">{label}</FieldLabel>
      <RadioGroup
        value={value}
        onValueChange={(next) => next && onChange(next as string)}
        className={cx("grid gap-2", !stack && "sm:grid-cols-3")}
      >
        {options.map((option) => (
          <label
            key={option.value}
            className="press grid cursor-pointer grid-cols-[auto_1fr] items-start gap-x-3 rounded-2xl border-2 border-line bg-surface p-3.5 hover:border-ink/25 has-data-checked:border-primary has-data-checked:bg-sticky-lavender/20"
          >
            <Radio value={option.value} className="mt-0.5">
              <RadioIndicator />
            </Radio>
            <span>
              <span className="flex items-center gap-2 font-semibold">
                {option.label}
                {option.badge && (
                  <span className="rounded-pill bg-sticky-mint px-2 py-0.5 text-xs font-bold">{option.badge}</span>
                )}
              </span>
              <span className="mt-0.5 block text-sm text-ink-muted">{option.description}</span>
            </span>
          </label>
        ))}
      </RadioGroup>
    </Field>
  );
}

/** A dialog on wide screens and a bottom sheet on phones, for one focused task. */
export function Sheet({
  open,
  onOpenChange,
  title,
  wide = false,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  wide?: boolean;
  children: ReactNode;
}) {
  const phone = useMediaQuery("(max-width: 767px)");
  if (phone) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerBackdrop />
        <DrawerContent className="flex max-h-[92dvh] w-full flex-col px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <DrawerHandle className="mx-auto mt-2.5 mb-1 h-1.5 w-10 rounded-full bg-line" aria-label="Resize sheet" />
          <DrawerTitle className="py-2 font-display text-xl">{title}</DrawerTitle>
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        </DrawerContent>
      </Drawer>
    );
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogBackdrop />
      <DialogContent
        className={cx(
          "pop fixed top-1/2 left-1/2 max-h-[85dvh] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-3xl bg-surface p-6 shadow-2xl",
          wide ? "max-w-2xl" : "max-w-lg",
        )}
      >
        <DialogTitle className="font-display text-2xl">{title}</DialogTitle>
        <div className="mt-4">{children}</div>
      </DialogContent>
    </Dialog>
  );
}

/** "Deleted · Undo" instead of a confirm dialog (D-046). */
export function deletedToast(what: string, undo: () => void) {
  toast(`${what} deleted`, { duration: 6000, action: { label: "Undo", onAction: undo } });
}

export { toast };

export function Toasts() {
  return (
    <ToastRegion side="bottom" align="center">
      {(item) => (
        <Toast>
          <ToastTitle className="text-sm font-medium" />
          {item.action && (
            <ToastAction className="press rounded-pill bg-surface/15 px-3.5 py-1.5 text-sm font-bold text-sticky-yellow hover:bg-surface/25" />
          )}
        </Toast>
      )}
    </ToastRegion>
  );
}

/** Mounted after hydration: for things that only make sense in the browser, like the platform's modifier key. */
export function useMounted() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

export const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

/** Which ends of a scrolling strip have more in them, kept current as it scrolls or resizes. */
export function useOverflow(ref: React.RefObject<HTMLElement | null>, axis: "x" | "y") {
  const [more, setMore] = useState({ start: false, end: false });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const pos = axis === "x" ? el.scrollLeft : el.scrollTop;
      const max = axis === "x" ? el.scrollWidth - el.clientWidth : el.scrollHeight - el.clientHeight;
      setMore((prev) => {
        const next = { start: pos > 2, end: pos < max - 2 };
        return prev.start === next.start && prev.end === next.end ? prev : next;
      });
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [ref, axis]);
  return more;
}

/**
 * Fades the edge of a strip that has more tools past it, with an arrow that scrolls to them. The arrow is a pointer
 * convenience: keyboard users reach every tool with the arrow keys, which scroll it into view.
 */
export function ScrollCue({
  side,
  show,
  axis,
  onPress,
  label,
}: {
  side: "start" | "end";
  show: boolean;
  axis: "x" | "y";
  onPress: () => void;
  label: string;
}) {
  const Arrow =
    axis === "x" ? (side === "start" ? CaretLeftIcon : CaretRightIcon) : side === "start" ? CaretUpIcon : CaretDownIcon;
  return (
    <div
      className={cx(
        "pointer-events-none absolute z-10 flex items-center justify-center transition-opacity duration-200",
        show ? "opacity-100" : "opacity-0",
        axis === "y"
          ? cx("inset-x-0 h-12", side === "start" ? "top-0 bg-linear-to-b" : "bottom-0 bg-linear-to-t")
          : cx("inset-y-0 w-12", side === "start" ? "left-0 bg-linear-to-r" : "right-0 bg-linear-to-l"),
        "from-surface from-35% to-transparent",
      )}
    >
      <button
        type="button"
        tabIndex={-1}
        aria-label={label}
        onClick={onPress}
        className={cx(
          "press grid size-7 place-items-center rounded-full border border-line bg-surface text-ink shadow-sm hover:bg-sticky-lavender/40",
          show && "pointer-events-auto",
          side === "end" && "animate-[nudge_1.6s_ease-in-out_2]",
        )}
        style={{ ["--nudge" as string]: axis === "x" ? "3px 0" : "0 3px" }}
      >
        <Arrow weight="bold" className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
