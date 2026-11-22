/**
 * A figure as shown and as spoken: the visible text is hidden from screen
 * readers, which get the figure's label instead ("hidden amount" under
 * Privacy, or the text plus "n trades left out" under R, ticks, pips and points).
 */
export function FigureText({
  f,
}: {
  f: { text: string; label: string };
}): React.JSX.Element {
  // Nothing to tell apart: the text is what is spoken.
  if (f.label === f.text) return <>{f.text}</>;
  return (
    <>
      <span aria-hidden="true">{f.text}</span>
      <span className="sr-only">{f.label}</span>
    </>
  );
}
