import {$dfs} from '@lexical/utils';
import {$getRoot} from 'lexical';

import {$isFootnoteRefNode, type FootnoteRefNode} from './FootnoteRefNode';
import {$getFootnoteSection} from './FootnoteSectionNode';
import {$getDefinitionEntries, $getDefinitionSlot} from './slots';

/**
 * Every cue in the document, grouped by footnote, in the order GFM numbers
 * them. This one walk is where all derived footnote state comes from:
 * insertion order into the map IS first-reference order (so it gives the
 * numbering), and each group is the cue list a note's backrefs lead back to.
 *
 * A cue may sit inside a note, which is what makes this more than a tree walk.
 * The canonical renderer (mdast-util-to-hast's `footer`) discovers those with
 * a loop whose bounds grow as it runs — rendering a note's content appends any
 * footnote it cites to the very list being iterated — so a note reached only
 * from inside another note is numbered after it, and lands after it in the
 * list. This mirrors that loop:
 *
 *   body cites [^a] [^b], and note a's text cites [^c]  →  a=1, b=2, c=3
 *
 * Cycles terminate because an id is enqueued the first time it is seen and
 * never again — a note citing itself simply has a second cue, and so a second
 * backref, which happens to point into its own text.
 *
 * `$dfs` walks the children spine only: definitions are slot values, so it
 * skips them, which is exactly why the body is phase one and the notes are
 * walked deliberately, in order, rather than swept up by a slot-aware walk.
 * (`$dfsWithSlots` would visit them in slot-map order — the code-unit order of
 * the ids — which has nothing to do with reference order.)
 */
export function $collectFootnoteRefs(): ReadonlyMap<
  string,
  readonly FootnoteRefNode[]
> {
  const refs = new Map<string, FootnoteRefNode[]>();
  // Cited ids, in numbering order. Grows while it is being iterated.
  const cited: string[] = [];
  const walked = new Set<string>();

  const collect = (start: Parameters<typeof $dfs>[0]) => {
    for (const {node} of $dfs(start)) {
      if ($isFootnoteRefNode(node)) {
        const footnoteId = node.getFootnoteId();
        if (!footnoteId) {
          continue;
        }
        const group = refs.get(footnoteId);
        if (group) {
          group.push(node);
        } else {
          refs.set(footnoteId, [node]);
          cited.push(footnoteId);
        }
      }
    }
  };

  collect($getRoot());
  const section = $getFootnoteSection();
  if (!section) {
    return refs;
  }
  const walkDefinition = (footnoteId: string) => {
    if (walked.has(footnoteId)) {
      return;
    }
    walked.add(footnoteId);
    const definition = $getDefinitionSlot(section, footnoteId);
    if (definition) {
      collect(definition);
    }
  };

  let next = 0;
  const drain = () => {
    while (next < cited.length) {
      walkDefinition(cited[next++]!);
    }
  };
  drain();

  // Orphans — notes nothing cites. GitHub drops them when it renders, so it
  // never looks inside one; we keep them, and a visible note whose own cues
  // rendered as `?` would look broken. So they are walked too, and the cues in
  // them are numbered. The orphan itself stays unnumbered (nothing cites it)
  // and so sorts last — see orderFootnoteIds.
  for (const {footnoteId} of $getDefinitionEntries(section)) {
    walkDefinition(footnoteId);
    drain();
  }
  return refs;
}

/**
 * Display numbers, derived from cue order (GFM numbering). Never stored on
 * nodes, and never read off the slot map — slot names canonicalize in
 * code-unit order, which has nothing to do with reference order.
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

/** Every cue for one footnote, in numbering order — including any inside a note. */
export function $getFootnoteRefs(
  footnoteId: string,
): readonly FootnoteRefNode[] {
  return $collectFootnoteRefs().get(footnoteId) ?? [];
}

/** Definition ids in display order: cited ones by number, then orphans. */
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
