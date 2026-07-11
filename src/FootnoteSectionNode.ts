import {$appendNodeToHTML, domOverride} from '@lexical/html';
import {
  $create,
  ElementNode,
  type DOMExportOutput,
  type EditorConfig,
  type LexicalEditor,
  type LexicalNode,
} from 'lexical';

import {$computeFootnoteNumbers, orderFootnoteIds} from './numbering';
import {
  $getDefinitionEntries,
  $getDefinitionSlot,
  footnoteIdFromSlotName,
} from './slots';

/**
 * Holds the footnote definitions — in named slots (`fn:<id>`), not as
 * children (see `slots.ts`). The node itself stays an ordinary last child of
 * the root, which is what keeps it reachable by the HTML and mdast
 * exporters; slots on the root would be invisible to both.
 *
 * Its DOM is a non-editable shell. That is load-bearing, not cosmetic: the
 * reconciler marks a slot container editable when its host's DOM is
 * `contentEditable="false"` (or the host is a decorator), which is what makes
 * each definition an editable island that can be mounted anywhere.
 */
export class FootnoteSectionNode extends ElementNode {
  $config() {
    return this.config('footnote-section', {extends: ElementNode});
  }

  createDOM(config: EditorConfig): HTMLElement {
    const section = document.createElement('section');
    // Marks every slot container on this host as an editable island.
    section.contentEditable = 'false';
    section.setAttribute('data-lexical-footnote-section', 'true');
    section.className =
      (config.theme.footnoteSection as string | undefined) ||
      'lexical-footnote__section';
    const list = document.createElement('ol');
    list.setAttribute('data-lexical-footnote-list', 'true');
    list.setAttribute('aria-label', 'Footnotes');
    section.appendChild(list);
    return section;
  }

  updateDOM(): boolean {
    return false;
  }

  /**
   * Slots are never auto-serialized to HTML — a host opts in from its own
   * exportDOM. Emits GitHub's shape: `<section data-footnotes><ol><li>`,
   * definitions in derived reference order.
   */
  exportDOM(editor: LexicalEditor): DOMExportOutput {
    const section = document.createElement('section');
    section.setAttribute('data-footnotes', 'true');
    const list = document.createElement('ol');
    section.appendChild(list);

    const numbers = $computeFootnoteNumbers();
    const ids = $getDefinitionEntries(this).map(entry => entry.footnoteId);
    for (const footnoteId of orderFootnoteIds(ids, numbers)) {
      const definition = $getDefinitionSlot(this, footnoteId);
      if (definition) {
        $appendNodeToHTML(editor, definition, list);
      }
    }
    return {element: section};
  }

  canIndent(): false {
    return false;
  }

  /**
   * MUST stay false. A childless host with `canBeEmpty() === true` satisfies
   * `INTERNAL_$isBlock`, making the non-editable shell itself a caret target:
   * text typed there lands in the shell's children channel, outside every
   * slot island, where it can be neither seen nor edited.
   */
  canBeEmpty(): false {
    return false;
  }
}

/**
 * Tells the reconciler where each definition's slot container belongs: an
 * `<li>` inside the section's list, created on demand. The reconciler
 * attaches and reveals the container synchronously in the same commit, so
 * the notes render without any listener, rAF, or imperative mount — and
 * nothing races the reconciler for ownership of the host's DOM.
 *
 * DOM order here is slot-map order (code-unit); display order comes from
 * `--order` on each item, which the extension keeps in sync with the
 * derived numbering.
 */
export const FootnoteSectionRenderOverride = /* @__PURE__ */ domOverride(
  [FootnoteSectionNode],
  {
    $getSlotTargetElement: (_node, slotName, hostDom) => {
      const footnoteId = footnoteIdFromSlotName(slotName);
      const list = hostDom.querySelector('[data-lexical-footnote-list]');
      if (footnoteId === null || !(list instanceof HTMLElement)) {
        return null;
      }
      const selector = `[data-lexical-footnote-item="${footnoteId}"]`;
      const existing = list.querySelector(selector);
      if (existing instanceof HTMLElement) {
        return existing;
      }
      const item = document.createElement('li');
      item.setAttribute('data-lexical-footnote-item', footnoteId);
      item.className = 'lexical-footnote__item';
      list.appendChild(item);
      return item;
    },
  },
);

export function $createFootnoteSectionNode(): FootnoteSectionNode {
  return $create(FootnoteSectionNode);
}

export function $isFootnoteSectionNode(
  node: LexicalNode | null | undefined,
): node is FootnoteSectionNode {
  return node instanceof FootnoteSectionNode;
}
