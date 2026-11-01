// Toolbar icons, 24 × 24 strokes in the text colour.

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

export const SelectIcon = () => (
  <Icon>
    <path d="M5 3l14 8-6 1.5L10 19z" />
  </Icon>
);

export const TextIcon = () => (
  <Icon>
    <path d="M5 6V4h14v2M12 4v16M9 20h6" />
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
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
  </Icon>
);
