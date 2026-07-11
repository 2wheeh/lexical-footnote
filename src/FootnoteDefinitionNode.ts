import {
  $create,
  $getState,
  $setState,
  ElementNode,
  type DOMExportOutput,
  type EditorConfig,
  type LexicalNode,
  type StateConfigValue,
  type StateValueOrUpdater,
} from 'lexical';

import {footnoteIdState} from './state';

/**
 * A footnote definition (`[^id]: ...` in GFM). Holds flow content
 * (paragraphs) as its children, and is itself a slot value on
 * FootnoteSectionNode — so it has no parent, and the extension mounts its
 * DOM (an editable island) wherever the notes are rendered.
 */
export class FootnoteDefinitionNode extends ElementNode {
  $config() {
    return this.config('footnote-def', {
      extends: ElementNode,
      stateConfigs: [{flat: true, stateConfig: footnoteIdState}],
    });
  }

  getFootnoteId(): StateConfigValue<typeof footnoteIdState> {
    return $getState(this, footnoteIdState);
  }

  setFootnoteId(
    valueOrUpdater: StateValueOrUpdater<typeof footnoteIdState>,
  ): this {
    return $setState(this, footnoteIdState, valueOrUpdater);
  }

  createDOM(config: EditorConfig): HTMLElement {
    const element = document.createElement('div');
    element.setAttribute('data-lexical-footnote-def', this.getFootnoteId());
    element.className =
      (config.theme.footnoteDefinition as string | undefined) ||
      'lexical-footnote__definition';
    return element;
  }

  updateDOM(): boolean {
    return false;
  }

  canIndent(): false {
    return false;
  }

  /** GFM-style HTML: `<li id="fn-id">…<a href="#fnref-id" data-footnote-backref>↩</a></li>` */
  exportDOM(): DOMExportOutput {
    const id = this.getFootnoteId();
    const item = document.createElement('li');
    item.setAttribute('id', `fn-${id}`);
    return {
      // Mutates in place and returns undefined: returning the element itself
      // would trigger `element.replaceWith(element)` in the exporter.
      after: generatedElement => {
        if (generatedElement instanceof HTMLElement) {
          const backref = document.createElement('a');
          backref.setAttribute('href', `#fnref-${id}`);
          backref.setAttribute('data-footnote-backref', 'true');
          backref.setAttribute('aria-label', 'Back to reference');
          backref.textContent = '↩';
          const last = generatedElement.lastElementChild;
          (last?.tagName === 'P' ? last : generatedElement).appendChild(
            backref,
          );
        }
        return undefined;
      },
      element: item,
    };
  }
}

export function $createFootnoteDefinitionNode(
  footnoteId: string,
): FootnoteDefinitionNode {
  return $create(FootnoteDefinitionNode).setFootnoteId(footnoteId);
}

export function $isFootnoteDefinitionNode(
  node: LexicalNode | null | undefined,
): node is FootnoteDefinitionNode {
  return node instanceof FootnoteDefinitionNode;
}
