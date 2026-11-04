// Toolbar icons: drawn on a 24 × 24 grid with 2-unit strokes in the text colour, round ends and corners, and about 2
// units of space to the edge, so they sit together as one set.

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="size-5"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

/** An arrow pointer. */
export const SelectIcon = () => (
  <Icon>
    <path d="M6 3.5v15l4-3.8 2.7 5.8 2.6-1.2-2.7-5.7H18z" />
  </Icon>
);

/** A serif capital T. */
export const TextIcon = () => (
  <Icon>
    <path d="M5 7V4.5h14V7" />
    <path d="M12 4.5v15" />
    <path d="M9 19.5h6" />
  </Icon>
);

/** A highlighter with a chisel tip, over a line. */
export const HighlightIcon = () => (
  <Icon>
    <path d="M15.5 3.5l5 5-8 8-5-5z" />
    <path d="M7.5 11.5l5 5-2 2H7.5L5.5 16.5z" />
    <path d="M3.5 20.5h17" />
  </Icon>
);

/** A pencil, writing. */
export const PenIcon = () => (
  <Icon>
    <path d="M16.5 3.5a2.1 2.1 0 013 3L8 18l-4.5 1.5L5 15z" />
    <path d="M14.5 5.5l4 4" />
  </Icon>
);

/** A speech bubble with two lines of words. */
export const CommentIcon = () => (
  <Icon>
    <path d="M5.5 4h13A2.5 2.5 0 0121 6.5v8a2.5 2.5 0 01-2.5 2.5H11l-4.5 3.5V17h-1A2.5 2.5 0 013 14.5v-8A2.5 2.5 0 015.5 4z" />
    <path d="M7.5 9h9" />
    <path d="M7.5 12.5h6" />
  </Icon>
);

/** A rubber stamp: handle, base and the line it prints. */
export const StampIcon = () => (
  <Icon>
    <path d="M12 3a3 3 0 00-1.5 5.6V12H6a2 2 0 00-2 2v2.5h16V14a2 2 0 00-2-2h-4.5V8.6A3 3 0 0012 3z" />
    <path d="M5 20.5h14" />
  </Icon>
);

/** A square behind a circle. */
export const ShapeIcon = () => (
  <Icon>
    <rect x={3.5} y={10} width={10.5} height={10.5} rx={1.5} />
    <path d="M14 13.4A5.5 5.5 0 109.4 8" />
  </Icon>
);

/** An eraser on a line: covering something up. */
export const WhiteoutIcon = () => (
  <Icon>
    <path d="M8.6 19.5L4.2 15.1a2 2 0 010-2.8l8.1-8.1a2 2 0 012.8 0l4.7 4.7a2 2 0 010 2.8l-7.8 7.8z" />
    <path d="M9.2 7.4l7.4 7.4" />
    <path d="M12 19.5h8.5" />
  </Icon>
);

/** A capital T with a small pencil: changing the words that are there. */
export const EditTextIcon = () => (
  <Icon>
    <path d="M3.5 6.5v-2h12v2" />
    <path d="M9.5 4.5v13" />
    <path d="M7.5 17.5h4" />
    <path d="M19 11.5a1.8 1.8 0 012.5 2.5L15 20.5l-3 1 1-3z" />
  </Icon>
);

/** A picture: frame, sun and hill. */
export const ImageIcon = () => (
  <Icon>
    <rect x={3} y={4} width={18} height={16} rx={2.5} />
    <circle cx={8.5} cy={9.5} r={1.75} />
    <path d="M21 15.5l-4.6-4.6a1.5 1.5 0 00-2.1 0L5 20" />
  </Icon>
);

/** A pen nib signing a line. */
export const SignIcon = () => (
  <Icon>
    <path d="M14.5 4.5l5 5-8.2 8.2-5.6 1.3 1.3-5.6z" />
    <path d="M12.5 6.5l5 5" />
    <path d="M3 21h18" />
  </Icon>
);

/** Two capital letters on a line: initials. */
export const InitialsIcon = () => (
  <Icon>
    <path d="M3.5 15.5l3-10 3 10" />
    <path d="M4.5 12.5h4" />
    <path d="M13 15.5v-10h3.5a2.5 2.5 0 010 5H13h4a2.5 2.5 0 010 5z" />
    <path d="M3 20h18" />
  </Icon>
);

/** A calendar page. */
export const DateIcon = () => (
  <Icon>
    <rect x={3.5} y={5} width={17} height={15.5} rx={2.5} />
    <path d="M3.5 10h17" />
    <path d="M8 3v4" />
    <path d="M16 3v4" />
    <path d="M7.5 14h2" />
    <path d="M11 14h2" />
  </Icon>
);

/** A ticked box. */
export const TickIcon = () => (
  <Icon>
    <rect x={3.5} y={3.5} width={17} height={17} rx={2.5} />
    <path d="M7.5 12.5l3 3 6-7" />
  </Icon>
);

// The shapes the Add shape tool draws, as they'll look.

export const RectangleIcon = () => (
  <Icon>
    <rect x={3} y={6} width={18} height={12} rx={1} />
  </Icon>
);

export const EllipseIcon = () => (
  <Icon>
    <ellipse cx={12} cy={12} rx={9} ry={6.5} />
  </Icon>
);

export const LineIcon = () => (
  <Icon>
    <path d="M4 20L20 4" />
  </Icon>
);

export const ArrowIcon = () => (
  <Icon>
    <path d="M4 20L20 4" />
    <path d="M10 4h10v10" />
  </Icon>
);

export const UndoIcon = () => (
  <Icon>
    <path d="M9 14L4 9l5-5" />
    <path d="M4 9h10.5a5.5 5.5 0 010 11H11" />
  </Icon>
);

export const RedoIcon = () => (
  <Icon>
    <path d="M15 14l5-5-5-5" />
    <path d="M20 9H9.5a5.5 5.5 0 000 11H13" />
  </Icon>
);

export const ZoomInIcon = () => (
  <Icon>
    <circle cx={11} cy={11} r={7} />
    <path d="M21 21l-4.3-4.3M11 8v6M8 11h6" />
  </Icon>
);

export const ZoomOutIcon = () => (
  <Icon>
    <circle cx={11} cy={11} r={7} />
    <path d="M21 21l-4.3-4.3M8 11h6" />
  </Icon>
);

export const TrashIcon = () => (
  <Icon>
    <path d="M4 7h16" />
    <path d="M10 11v6M14 11v6" />
    <path d="M6 7l1 12.5A1.5 1.5 0 008.5 21h7a1.5 1.5 0 001.5-1.5L18 7" />
    <path d="M9 7V4.5A1.5 1.5 0 0110.5 3h3A1.5 1.5 0 0115 4.5V7" />
  </Icon>
);
