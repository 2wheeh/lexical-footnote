import type {LexicalEditor} from 'lexical';

import {$getOrderedFootnoteIds} from '../model/definitions';
import {$getFootnoteSection} from '../nodes/FootnoteSectionNode';

/**
 * The `<li>`s are ours, not the reconciler's: the render override creates one
 * on demand as each definition's slot container needs a home, and the
 * reconciler only ever attaches and detaches the container *inside* it. So an
 * item whose definition is gone is ours to reclaim, or it lingers as an empty
 * numbered row.
 *
 * The rest is projection. Slot-map order is the code-unit order of the ids, so
 * DOM order is meaningless: display order comes from `order` (a flex column —
 * moving the `<li>`s would move the DOM selection with them), and the marker
 * from `value`, since `::marker` counts DOM position.
 *
 * Runs on commit, not in a frame: the DOM is already reconciled by then, and
 * nothing here needs layout.
 */
export function syncSectionList(editor: LexicalEditor): void {
  const {sectionKey, orderedIds} = editor.read(() => {
    const section = $getFootnoteSection();
    return {
      orderedIds: $getOrderedFootnoteIds(),
      sectionKey: section ? section.getKey() : null,
    };
  });
  if (sectionKey === null) {
    return;
  }
  const list = editor
    .getElementByKey(sectionKey)
    ?.querySelector('[data-lexical-footnote-list]');
  if (!(list instanceof HTMLElement)) {
    return;
  }
  const live = new Set(orderedIds);
  for (const item of Array.from(
    list.querySelectorAll('[data-lexical-footnote-item]'),
  )) {
    if (!live.has(item.getAttribute('data-lexical-footnote-item') ?? '')) {
      item.remove();
    }
  }
  orderedIds.forEach((footnoteId, index) => {
    const item = list.querySelector(
      `[data-lexical-footnote-item="${footnoteId}"]`,
    );
    if (item instanceof HTMLLIElement) {
      item.style.order = String(index + 1);
      item.value = index + 1;
    }
  });
}
