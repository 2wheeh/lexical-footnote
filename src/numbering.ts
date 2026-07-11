import {$dfs} from '@lexical/utils';

import {$isFootnoteRefNode} from './FootnoteRefNode';

/**
 * Display numbers, derived from the document order of first references
 * (GFM numbering). Never stored on nodes, and never read off the slot map —
 * slot names canonicalize in code-unit order, which has nothing to do with
 * reference order.
 *
 * `$dfs` walks the children spine only, which is exactly the body: cues live
 * there, and definitions do not (they are slot values on the section).
 */
export function $computeFootnoteNumbers(): ReadonlyMap<string, number> {
  const numbers = new Map<string, number>();
  for (const {node} of $dfs()) {
    if ($isFootnoteRefNode(node)) {
      const id = node.getFootnoteId();
      if (id && !numbers.has(id)) {
        numbers.set(id, numbers.size + 1);
      }
    }
  }
  return numbers;
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
