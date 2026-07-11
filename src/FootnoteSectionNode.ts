import {
  $create,
  ElementNode,
  type DOMExportOutput,
  type EditorConfig,
  type LexicalNode,
} from 'lexical';

/**
 * Container for footnote definitions. Structural invariants (enforced by
 * FootnoteExtension transforms): always the last child of the root, at most
 * one per document, children are FootnoteDefinitionNodes ordered by first
 * reference.
 */
export class FootnoteSectionNode extends ElementNode {
  $config() {
    return this.config('footnote-section', {extends: ElementNode});
  }

  createDOM(config: EditorConfig): HTMLElement {
    const ol = document.createElement('ol');
    ol.setAttribute('data-lexical-footnote-section', 'true');
    ol.className =
      (config.theme.footnoteSection as string | undefined) ||
      'lexical-footnote__section';
    return ol;
  }

  updateDOM(): boolean {
    return false;
  }

  /** GFM-style HTML: `<section data-footnotes><ol>…definitions…</ol></section>` */
  exportDOM(): DOMExportOutput {
    const section = document.createElement('section');
    section.setAttribute('data-footnotes', 'true');
    const ol = document.createElement('ol');
    section.appendChild(ol);
    return {
      append: child => ol.appendChild(child),
      element: section,
    };
  }

  canIndent(): false {
    return false;
  }

  canBeEmpty(): false {
    return false;
  }
}

export function $createFootnoteSectionNode(): FootnoteSectionNode {
  return $create(FootnoteSectionNode);
}

export function $isFootnoteSectionNode(
  node: LexicalNode | null | undefined,
): node is FootnoteSectionNode {
  return node instanceof FootnoteSectionNode;
}
