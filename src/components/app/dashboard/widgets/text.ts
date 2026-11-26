/** A caption at the start of a line: "all time" reads "All time". */
export function sentenceCase(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
