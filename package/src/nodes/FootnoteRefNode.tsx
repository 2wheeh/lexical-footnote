import type {JSX} from 'react';

import {DecoratorTextNode} from '@lexical/extension';
import {useExtensionDependency} from '@lexical/react/useExtensionComponent';
import {useExtensionSignalValue} from '@lexical/react/useExtensionSignalValue';
import {useLexicalNodeSelection} from '@lexical/react/useLexicalNodeSelection';
import {
  $create,
  $getState,
  $setState,
  type DOMExportOutput,
  type EditorConfig,
  type LexicalNode,
  type StateConfigValue,
  type StateValueOrUpdater,
} from 'lexical';

import {FootnoteExtension} from '../FootnoteExtension';
import {backrefTargetId, FOOTNOTE_LABEL_ID} from '../io/gfm';
import {$computeFootnoteNumbers, $getFootnoteRefs} from '../model/numbering';
import {footnoteIdState} from '../model/state';

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

  /**
   * GFM-style HTML: `<sup><a href="#fn-id" id="fnref-id" data-footnote-ref>n</a></sup>`.
   *
   * A note can be cited more than once, and every cue needs an id of its own
   * for its backref to land on — so the second and later cues for the same id
   * are suffixed (`fnref-id-2`), exactly as GitHub does it. Without the
   * suffix, repeat cues would all carry the same DOM id.
   */
  exportDOM(): DOMExportOutput {
    const id = this.getFootnoteId();
    const number = $computeFootnoteNumbers().get(id);
    const occurrence = $getFootnoteRefs(id).indexOf(this) + 1;
    const sup = document.createElement('sup');
    const anchor = document.createElement('a');
    anchor.setAttribute('href', `#fn-${id}`);
    anchor.setAttribute('id', backrefTargetId(id, occurrence));
    anchor.setAttribute('data-footnote-ref', '');
    // Names the bare number for a screen reader; the section exports the
    // element this points at.
    anchor.setAttribute('aria-describedby', FOOTNOTE_LABEL_ID);
    anchor.textContent = String(number ?? '?');
    sup.appendChild(anchor);
    return {element: sup};
  }

  decorate(): JSX.Element {
    return (
      <FootnoteRefComponent
        footnoteId={this.getFootnoteId()}
        nodeKey={this.getKey()}
      />
    );
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

function FootnoteRefComponent({
  footnoteId,
  nodeKey,
}: {
  footnoteId: string;
  nodeKey: string;
}) {
  const numbers = useExtensionSignalValue(FootnoteExtension, 'numbers');
  const {gotoDefinition} = useExtensionDependency(FootnoteExtension).output;
  const [isSelected] = useLexicalNodeSelection(nodeKey);
  const number = numbers.get(footnoteId);
  return (
    <sup className={isSelected ? 'lexical-footnote__ref--selected' : undefined}>
      <button
        type="button"
        tabIndex={-1}
        onClick={() => gotoDefinition(footnoteId)}
        aria-label={`Go to footnote ${number ?? footnoteId}`}
      >
        {number ?? '?'}
      </button>
    </sup>
  );
}
