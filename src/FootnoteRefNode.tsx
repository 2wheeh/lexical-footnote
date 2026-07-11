import type {JSX} from 'react';

import {DecoratorTextNode} from '@lexical/extension';
import {useExtensionDependency} from '@lexical/react/useExtensionComponent';
import {useExtensionSignalValue} from '@lexical/react/useExtensionSignalValue';
import {
  $create,
  $getState,
  $setState,
  type EditorConfig,
  type LexicalNode,
  type StateConfigValue,
  type StateValueOrUpdater,
} from 'lexical';

import {FootnoteExtension} from './FootnoteExtension';
import {footnoteIdState} from './state';

/**
 * The inline footnote cue (`[^id]` in GFM), rendered as a superscript
 * number. The displayed number is presentation-only — derived from document
 * order and read from the FootnoteExtension `numbers` signal, never stored.
 */
export class FootnoteRefNode extends DecoratorTextNode {
  $config() {
    return this.config('footnote-ref', {
      extends: DecoratorTextNode,
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

  getTextContent(): string {
    return `[^${this.getFootnoteId()}]`;
  }

  createDOM(config: EditorConfig): HTMLElement {
    const span = document.createElement('span');
    span.setAttribute('data-lexical-footnote-ref', this.getFootnoteId());
    span.className =
      (config.theme.footnoteRef as string | undefined) ||
      'lexical-footnote__ref';
    return span;
  }

  updateDOM(): false {
    return false;
  }

  decorate(): JSX.Element {
    return <FootnoteRefComponent footnoteId={this.getFootnoteId()} />;
  }
}

export function $createFootnoteRefNode(footnoteId: string): FootnoteRefNode {
  return $create(FootnoteRefNode).setFootnoteId(footnoteId);
}

export function $isFootnoteRefNode(
  node: LexicalNode | null | undefined,
): node is FootnoteRefNode {
  return node instanceof FootnoteRefNode;
}

function FootnoteRefComponent({footnoteId}: {footnoteId: string}) {
  const numbers = useExtensionSignalValue(FootnoteExtension, 'numbers');
  const {gotoDefinition} = useExtensionDependency(FootnoteExtension).output;
  const number = numbers.get(footnoteId);
  return (
    <sup>
      <button
        type="button"
        onClick={() => gotoDefinition(footnoteId)}
        aria-label={`Go to footnote ${number ?? footnoteId}`}>
        [{number ?? '?'}]
      </button>
    </sup>
  );
}
