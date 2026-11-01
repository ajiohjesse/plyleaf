/** The blue frame with corner handles round a selected item (DESIGN.md's canvas motif). Decoration only. */
export function SelectionFrame() {
  return (
    <span aria-hidden="true" className="pointer-events-none absolute -inset-1 border-2 border-primary">
      {["-left-1 -top-1", "-right-1 -top-1", "-left-1 -bottom-1", "-right-1 -bottom-1"].map((corner) => (
        <span key={corner} className={`absolute size-2 border-2 border-primary bg-surface ${corner}`} />
      ))}
    </span>
  );
}
