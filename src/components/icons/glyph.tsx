export type Glyphs = Record<string, { d: string; faint?: true }[]>;

export interface IconProps {
  className?: string;
}

/** An icon component for one generated glyph (scripts/icons.ts). */
export function makeIcon(glyphs: Glyphs, name: string, weight = "bold") {
  const paths = glyphs[`${name}:${weight}`];
  if (!paths) throw new Error(`Icon ${name} (${weight}) isn't generated: add it to scripts/icons.ts`);
  return function Icon({ className = "size-5" }: IconProps) {
    return (
      <svg viewBox="0 0 256 256" fill="currentColor" aria-hidden="true" className={className}>
        {paths.map((path, i) => (
          <path key={i} d={path.d} {...(path.faint && { opacity: 0.2 })} />
        ))}
      </svg>
    );
  };
}
