import {$dfs} from '@lexical/utils';

import {$isFootnoteRefNode, type FootnoteRefNode} from './FootnoteRefNode';

/**
 * Every cue in the document, grouped by footnote and kept in document order.
 * This one walk is where all derived footnote state comes from: insertion
 * order into the map IS first-reference order (so it gives the numbering),
 * and each group is the cue list a note's backrefs lead back to.
 *
 * `$dfs` walks the children spine only, which is exactly the body: cues live
 * there, and definitions do not (they are slot values on the section), so
 * nothing here can see a cue nested inside a note.
 */
export function $collectFootnoteRefs(): ReadonlyMap<
  string,
  readonly FootnoteRefNode[]
> {
  const refs = new Map<string, FootnoteRefNode[]>();
  for (const {node} of $dfs()) {
    if ($isFootnoteRefNode(node)) {
      const id = node.getFootnoteId();
      if (id) {
        const group = refs.get(id);
        if (group) {
          group.push(node);
        } else {
          refs.set(id, [node]);
        }
      }
    }
  }
  return refs;
}

/**
 * Display numbers, derived from the document order of first references (GFM
 * numbering). Never stored on nodes, and never read off the slot map — slot
 * names canonicalize in code-unit order, which has nothing to do with
 * reference order.
 */
export function $computeFootnoteNumbers(): ReadonlyMap<string, number> {
  return footnoteNumbersOf($collectFootnoteRefs());
}

/** The numbering implied by a cue collection — no walk of its own. */
export function footnoteNumbersOf(
  refs: ReadonlyMap<string, readonly FootnoteRefNode[]>,
): ReadonlyMap<string, number> {
  const numbers = new Map<string, number>();
  for (const footnoteId of refs.keys()) {
    numbers.set(footnoteId, numbers.size + 1);
  }
  return numbers;
}

/** Every cue for one footnote, in document order. */
export function $getFootnoteRefs(
  footnoteId: string,
): readonly FootnoteRefNode[] {
  return $collectFootnoteRefs().get(footnoteId) ?? [];
}

/** Definition ids in display order: referenced ones by number, then orphans. */
export function orderFootnoteIds(
  footnoteIds: readonly string[],
  numbers: ReadonlyMap<string, number>,
): string[] {
  return [...footnoteIds].sort((a, b) => {
    const an = numbers.get(a) ?? Number.MAX_SAFE_INTEGER;
    const bn = numbers.get(b) ?? Number.MAX_SAFE_INTEGER;
    return an - bn;
  });
}
