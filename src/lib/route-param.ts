/** A dynamic route segment, percent-decoded; one that doesn't decode comes back as given. Next hands the segment over percent-encoded. */
export function decodedSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}
