/**
 * The HTML contract for cues and backrefs, as GitHub renders it (the shape
 * `mdast-util-to-hast` produces from GFM footnotes). Both halves of a link
 * have to agree on the same string, so they are derived here rather than
 * spelled out twice.
 *
 * We omit GitHub's `user-content-` clobber prefix — that exists to namespace
 * ids against a hostile document, which is a host concern, not ours. The
 * importer accepts both.
 */

/**
 * The DOM id of the nth cue for a footnote (1-based), and so the target its
 * backref points at. The first cue is unsuffixed; repeats are numbered, or
 * every cue for a multiply-cited note would carry the same id.
 */
export function backrefTargetId(footnoteId: string, occurrence: number): string {
  return occurrence > 1
    ? `fnref-${footnoteId}-${occurrence}`
    : `fnref-${footnoteId}`;
}

/** `Back to reference 2-3`: the note's number, then which cue of it. */
export function backrefLabel(
  footnoteNumber: number | string,
  occurrence: number,
): string {
  return occurrence > 1
    ? `Back to reference ${footnoteNumber}-${occurrence}`
    : `Back to reference ${footnoteNumber}`;
}
