import { useEffect, useId, useMemo, useRef, useState } from "react";
import { categories, filterTools, tools, type Category } from "~/data/tools";
import { CategoryIcon } from "./CategoryIcon";

const stickyBg: Record<Category["sticky"], string> = {
  yellow: "bg-sticky-yellow",
  lavender: "bg-sticky-lavender",
  pink: "bg-sticky-pink",
  mint: "bg-sticky-mint",
  coral: "bg-sticky-coral",
};

/** Searchable tool grid, grouped by category. Rendered to HTML at build time, then hydrated for the search box. */
export function ToolGrid() {
  const [query, setQuery] = useState("");
  const searchId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  // The grid hydrates when it scrolls into view; keep anything typed into the static HTML before that.
  useEffect(() => {
    if (inputRef.current?.value) setQuery(inputRef.current.value);
  }, []);
  const matches = useMemo(() => filterTools(tools, query), [query]);
  const groups = categories
    .map((category) => ({ category, items: matches.filter((t) => t.category === category.id) }))
    .filter((group) => group.items.length > 0);

  return (
    <div>
      <div className="mx-auto max-w-xl">
        <label htmlFor={searchId} className="sr-only">
          Search tools
        </label>
        <div className="relative">
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-5 size-5 -translate-y-1/2 text-ink-muted"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            id={searchId}
            type="search"
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tools: merge, sign, jpg…"
            autoComplete="off"
            className="h-14 w-full rounded-pill border-2 border-line bg-surface pr-5 pl-13 text-lg text-ink placeholder:text-ink-muted focus:border-primary focus:outline-none"
          />
        </div>
        <output aria-live="polite" className="mt-3 block text-center text-sm text-ink-muted">
          {query.trim() === ""
            ? `${tools.length} tools, all free`
            : matches.length === 0
              ? `No tool matches “${query.trim()}” yet.`
              : `${matches.length} ${matches.length === 1 ? "tool" : "tools"} found`}
        </output>
      </div>

      <div className="mt-10 space-y-12">
        {groups.map(({ category, items }) => (
          <section key={category.id} aria-labelledby={`cat-${category.id}`}>
            <h3 id={`cat-${category.id}`} className="flex items-center gap-3 text-2xl">
              <span
                className={`inline-block size-3 rotate-12 rounded-[3px] ${stickyBg[category.sticky]}`}
                aria-hidden="true"
              />
              {category.name}
            </h3>
            <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {items.map((tool) => {
                const body = (
                  <>
                    <span
                      className={`grid size-11 shrink-0 -rotate-3 place-items-center rounded-lg text-ink shadow-sticky transition-transform group-hover:rotate-0 ${stickyBg[category.sticky]}`}
                    >
                      <CategoryIcon category={tool.category} className="size-6" />
                    </span>
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-x-2 font-display text-lg leading-tight font-bold">
                        {tool.name}
                        {!tool.available && (
                          <span className="rounded-pill bg-surface-band px-2 py-0.5 font-sans text-xs font-semibold text-ink-muted">
                            Soon
                          </span>
                        )}
                      </span>
                      <span className="mt-1 block text-sm text-ink-muted">{tool.description}</span>
                    </span>
                  </>
                );
                const tile = "group flex h-full gap-4 rounded-card border border-line bg-surface p-4";
                return (
                  <li key={tool.slug}>
                    {tool.available ? (
                      <a href={`/${tool.slug}`} className={`${tile} transition-colors hover:border-primary`}>
                        {body}
                      </a>
                    ) : (
                      <div className={tile}>{body}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
