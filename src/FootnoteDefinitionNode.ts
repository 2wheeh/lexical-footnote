import {
  $create,
  $getState,
  $setState,
  ElementNode,
  type DOMExportOutput,
  type EditorConfig,
  type ElementDOMSlot,
  type LexicalNode,
  type StateConfigValue,
  type StateValueOrUpdater,
} from 'lexical';

import {footnoteIdState} from './state';

/**
 * A footnote definition (`[^id]: ...` in GFM). Holds arbitrary flow content
 * (paragraphs etc.) as children. Lives inside FootnoteSectionNode; the
 * FootnoteExtension transforms relocate stray definitions there.
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
    const li = document.createElement('li');
    li.setAttribute('data-lexical-footnote-def', this.getFootnoteId());
    li.className =
      (config.theme.footnoteDefinition as string | undefined) ||
      'lexical-footnote__definition';
    const content = document.createElement('div');
    content.className =
      (config.theme.footnoteDefinitionContent as string | undefined) ||
      'lexical-footnote__definition-content';
    // The visible backref marker is a CSS ::after pseudo-element on this
    // div, and its keyboard proxy lives OUTSIDE the contentEditable (see
    // FootnoteExtension). No unmanaged element may live inside the li:
    // anything here becomes a target for caret movement (word-jump,
    // ArrowDown) that Lexical then mis-resolves.
    content.setAttribute('data-lexical-footnote-content', 'true');
    li.append(content);
    return li;
  }

  /** Children reconcile into the content wrapper, not the `<li>` itself. */
  getDOMSlot(dom: HTMLElement): ElementDOMSlot<HTMLElement> {
    const content = dom.firstElementChild;
    return content instanceof HTMLElement
      ? super.getDOMSlot(dom).withElement(content)
      : super.getDOMSlot(dom);
  }

  updateDOM(): boolean {
    return false;
  }

  /** GFM-style HTML: `<li id="fn-id">…<a href="#fnref-id" data-footnote-backref>↩</a></li>` */
  exportDOM(): DOMExportOutput {
    const id = this.getFootnoteId();
    const li = document.createElement('li');
    li.setAttribute('id', `fn-${id}`);
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
      element: li,
    };
  }

  canIndent(): false {
    return false;
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
