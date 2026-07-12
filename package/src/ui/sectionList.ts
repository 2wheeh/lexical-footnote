import type {LexicalEditor} from 'lexical';

import type {DerivedFootnotes} from './derived';

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
 */
export function syncSectionList(
  editor: LexicalEditor,
  {sectionKey, orderedIds}: DerivedFootnotes,
): void {
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
