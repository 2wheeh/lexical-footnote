import {$getPeerDependency} from '@lexical/extension';
import {$appendNodeToHTML, domOverride} from '@lexical/html';
import {
  $create,
  $getRoot,
  ElementNode,
  type DOMExportOutput,
  type EditorConfig,
  type LexicalEditor,
  type LexicalNode,
} from 'lexical';

import type {FootnoteExtension} from '../FootnoteExtension';
import {FOOTNOTE_LABEL_ID} from '../io/gfm';
import {$computeFootnoteNumbers, orderFootnoteIds} from '../model/numbering';
import {
  $getDefinitionEntries,
  $getDefinitionSlot,
  footnoteIdFromSlotName,
} from '../model/slots';

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
    section.setAttribute('data-footnotes', '');
    section.setAttribute('class', 'footnotes');
    // What every cue's aria-describedby points at. Visually hidden by the
    // host's stylesheet (GitHub's is `sr-only`), so it names the section for
    // a screen reader without adding a heading to the page.
    const label = document.createElement('h2');
    label.setAttribute('id', FOOTNOTE_LABEL_ID);
    label.setAttribute('class', 'sr-only');
    label.textContent = 'Footnotes';
    section.appendChild(label);
    const list = document.createElement('ol');
    section.appendChild(list);

    const numbers = $computeFootnoteNumbers();
    // Orphans are kept, unlike GitHub — which drops any definition nothing
    // refers to. Our HTML is a document format, not only a rendering: an
    // orphan note is content the user wrote, and losing it on export would be
    // silent data loss. `dropOrphansOnExport` opts into GitHub's behavior for
    // consumers whose HTML *is* the rendering.
    //
    // Looked up by name, with the extension imported for its type only: a
    // value import would close a cycle — the extension eagerly references the
    // render override below — and which module the bundler evaluated first
    // would decide whether that throws.
    const dropOrphans =
      $getPeerDependency<typeof FootnoteExtension>('lexical-footnote/Footnote')
        ?.config.dropOrphansOnExport ?? false;
    const ids = $getDefinitionEntries(this)
      .map(entry => entry.footnoteId)
      .filter(id => !dropOrphans || numbers.has(id));
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
 * The `<li>`s are the extension's, not the reconciler's — it owns only the
 * container inside — so the extension is what numbers them, orders them, and
 * reclaims them when a definition goes. DOM order here is slot-map order
 * (code-unit), which is not display order.
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

/**
 * Lives here rather than in the extension so that `numbering.ts` can reach the
 * definitions — a cue may sit inside a note, and the numbering has to walk
 * into them — without importing the extension and closing a module cycle.
 */
export function $getFootnoteSection(): FootnoteSectionNode | null {
  for (const child of $getRoot().getChildren()) {
    if ($isFootnoteSectionNode(child)) {
      return child;
    }
  }
  return null;
}

export function $isFootnoteSectionNode(
  node: LexicalNode | null | undefined,
): node is FootnoteSectionNode {
  return node instanceof FootnoteSectionNode;
}
