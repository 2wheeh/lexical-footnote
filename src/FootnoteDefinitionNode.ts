import {
  $create,
  $getState,
  $setState,
  ElementNode,
  type EditorConfig,
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
    return li;
  }

  updateDOM(): boolean {
    return false;
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
