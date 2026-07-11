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

import {BACKREF_CLASS, backrefLabel, backrefTargetId} from './gfm';
import {$computeFootnoteNumbers, $getFootnoteRefs} from './numbering';
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

  /**
   * GFM-style HTML: `<li id="fn-id">…<a href="#fnref-id" data-footnote-backref>↩</a></li>`.
   *
   * One backref per cue, not per note: a note cited three times is reachable
   * from three places, and each backref leads to its own cue (`↩`, `↩²`, `↩³`).
   * They go inside the note's last paragraph, separated by spaces, so they
   * read as a trailing run of links rather than a block of their own.
   */
  exportDOM(): DOMExportOutput {
    const id = this.getFootnoteId();
    const number = $computeFootnoteNumbers().get(id) ?? '?';
    const refCount = $getFootnoteRefs(id).length;
    const item = document.createElement('li');
    item.setAttribute('id', `fn-${id}`);
    return {
      // Mutates in place and returns undefined: returning the element itself
      // would trigger `element.replaceWith(element)` in the exporter.
      after: generatedElement => {
        if (!(generatedElement instanceof HTMLElement)) {
          return undefined;
        }
        const last = generatedElement.lastElementChild;
        const host = last?.tagName === 'P' ? last : generatedElement;
        for (let occurrence = 1; occurrence <= refCount; occurrence++) {
          const backref = document.createElement('a');
          backref.setAttribute('href', `#${backrefTargetId(id, occurrence)}`);
          backref.setAttribute('data-footnote-backref', '');
          backref.setAttribute('class', BACKREF_CLASS);
          backref.setAttribute('aria-label', backrefLabel(number, occurrence));
          backref.append('↩');
          if (occurrence > 1) {
            const sup = document.createElement('sup');
            sup.textContent = String(occurrence);
            backref.appendChild(sup);
          }
          host.append(' ', backref);
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
