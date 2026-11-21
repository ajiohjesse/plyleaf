// ⌘K (D-045): every tool, with synonyms; with a working document, picking a tool applies it as the next step.
import type { Icon } from "@phosphor-icons/react";
import {
  ArrowCounterClockwiseIcon,
  ArrowClockwiseIcon,
  CornersOutIcon,
  DownloadSimpleIcon,
  FolderOpenIcon,
  HouseIcon,
  KeyboardIcon,
  MagnifyingGlassIcon,
  ShieldCheckIcon,
  XIcon,
} from "@phosphor-icons/react/ssr";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandGroupLabel,
  CommandInput,
  CommandItem,
  CommandItemIcon,
  CommandItemText,
  CommandList,
  CommandShortcut,
} from "@ui-sdk/react/command";
import { Dialog, DialogBackdrop, DialogContent, DialogTitle } from "@ui-sdk/react/dialog";
import { categories, tools } from "~/data/tools";
import { ToolIcon, roleOf } from "./icons";
import { useWorkingDoc, workingDoc } from "./store";
import { toast } from "./ui";

/** Tools the prototype has a page for; the rest say where they'd go. */
export const prototypePages: Record<string, string> = {
  "compress-pdf": "/prototype/compress",
  "edit-pdf": "/prototype/editor",
  "sign-pdf": "/prototype/editor?tool=sign",
  "annotate-pdf": "/prototype/editor",
};

export function openTool(slug: string) {
  const page = prototypePages[slug];
  const name = tools.find((tool) => tool.slug === slug)?.name ?? slug;
  if (page) window.location.href = page;
  else toast(`${name} would open here, with your working document`);
}

interface Action {
  value: string;
  label: string;
  icon: Icon;
  shortcut?: string;
  keywords?: string[];
  run: () => void;
  when?: "doc" | "workspace";
}

export function Palette({
  open,
  onOpenChange,
  workspace,
  onUndo,
  onRedo,
  onExpand,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspace: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  onExpand?: () => void;
}) {
  const doc = useWorkingDoc();
  const actions: Action[] = [
    {
      value: "open",
      label: "Open a file…",
      icon: FolderOpenIcon,
      shortcut: "mod+o",
      keywords: ["upload", "add", "drop"],
      run: () => {
        workingDoc.open();
        window.location.href = "/prototype/workbench";
      },
    },
    {
      value: "download",
      label: "Download the working document",
      icon: DownloadSimpleIcon,
      keywords: ["save", "export"],
      when: "doc",
      run: () => toast("Downloading lease-agreement.pdf"),
    },
    {
      value: "close",
      label: "Close the working document",
      icon: XIcon,
      when: "doc",
      keywords: ["forget", "clear"],
      run: () => workingDoc.close(),
    },
    { value: "undo", label: "Undo", icon: ArrowCounterClockwiseIcon, when: "workspace", run: () => onUndo?.() },
    { value: "redo", label: "Redo", icon: ArrowClockwiseIcon, when: "workspace", run: () => onRedo?.() },
    {
      value: "expand",
      label: "Expand",
      icon: CornersOutIcon,
      when: "workspace",
      keywords: ["full screen", "focus", "maximise"],
      run: () => onExpand?.(),
    },
    {
      value: "shortcuts",
      label: "Keyboard shortcuts",
      icon: KeyboardIcon,
      keywords: ["hotkeys", "keys", "help"],
      run: () => toast("The shortcuts list opens here (also on ?)"),
    },
    { value: "home", label: "Home", icon: HouseIcon, run: () => (window.location.href = "/") },
    { value: "privacy", label: "Privacy", icon: ShieldCheckIcon, run: () => toast("The privacy page arrives in M9") },
  ];
  const shown = actions.filter((a) => !a.when || (a.when === "doc" ? doc : workspace));
  const run = (value: string) => {
    onOpenChange(false);
    const action = actions.find((a) => a.value === value);
    if (action) return action.run();
    openTool(value);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogBackdrop />
      <DialogContent className="pop fixed top-[12dvh] left-1/2 flex max-h-[min(36rem,76dvh)] w-[calc(100vw-1.5rem)] max-w-xl -translate-x-1/2 flex-col overflow-hidden rounded-3xl border border-line bg-surface shadow-2xl">
        <DialogTitle className="sr-only">Find a tool or action</DialogTitle>
        <Command onAction={run} className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center gap-3 border-b border-line px-4">
            <MagnifyingGlassIcon weight="bold" className="size-5 text-ink-muted" aria-hidden="true" />
            <CommandInput
              aria-label="Find a tool or action"
              placeholder={doc ? `What next for ${doc.name}?` : "Find a tool… try “shrink” or “combine”"}
              className="h-14 flex-1 bg-transparent text-lg outline-none placeholder:text-ink-muted"
            />
            <kbd className="rounded-md border border-line px-1.5 py-0.5 text-xs text-ink-muted">Esc</kbd>
          </div>
          <CommandEmpty className="hidden px-4 py-10 data-empty:block text-center text-ink-muted">
            Nothing matches. Try another word.
          </CommandEmpty>
          <CommandList className="min-h-0 flex-1 overflow-y-auto p-2">
            {categories.map((category) => (
              <CommandGroup key={category.id}>
                <CommandGroupLabel>
                  {doc && category.id === categories[0]!.id ? "Apply to your working document · " : ""}
                  {category.name}
                </CommandGroupLabel>
                {tools
                  .filter((tool) => tool.category === category.id && tool.available)
                  .map((tool) => (
                    <CommandItem
                      key={tool.slug}
                      value={tool.slug}
                      label={tool.name}
                      keywords={[...(tool.keywords ?? []), tool.description]}
                    >
                      <CommandItemIcon className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-band">
                        <ToolIcon slug={tool.slug} />
                      </CommandItemIcon>
                      <span className="min-w-0 flex-1">
                        <CommandItemText className="block font-semibold" />
                        <span className="block truncate text-sm text-ink-muted">{tool.description}</span>
                      </span>
                      {doc && roleOf(tool.slug) === "ends" && (
                        <span className="shrink-0 rounded-pill bg-surface-band px-2 py-0.5 text-xs font-semibold text-ink-muted">
                          Downloads files
                        </span>
                      )}
                    </CommandItem>
                  ))}
              </CommandGroup>
            ))}
            <CommandGroup>
              <CommandGroupLabel>Actions</CommandGroupLabel>
              {shown.map((action) => (
                <CommandItem
                  key={action.value}
                  value={action.value}
                  label={action.label}
                  {...(action.keywords && { keywords: action.keywords })}
                  {...(action.shortcut && { shortcut: action.shortcut })}
                >
                  <CommandItemIcon className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-band">
                    <action.icon weight="bold" className="size-4.5" aria-hidden="true" />
                  </CommandItemIcon>
                  <CommandItemText className="flex-1 font-semibold" />
                  {action.shortcut && (
                    <CommandShortcut className="text-xs text-ink-muted">{(s) => s.text}</CommandShortcut>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
