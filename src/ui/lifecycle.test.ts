import {
  buildEditorFromExtensions,
  type LexicalEditorWithDispose,
} from '@lexical/extension';
import {HistoryExtension} from '@lexical/history';
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $selectAll,
  $nodesOfType,
} from 'lexical';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {
  $cleanupOrphanFootnotes,
  $getFootnoteDefinition,
  $getFootnoteSection,
  $getOrderedFootnoteIds,
  $removeFootnoteDefinition,
  FootnoteExtension,
} from '../FootnoteExtension';
import {$createFootnoteRefNode, FootnoteRefNode} from '../nodes/FootnoteRefNode';

/**
 * The two things the slot model made fragile, exercised rather than argued:
 *
 * - The deletion transforms diff snapshots that only refresh on commit, and
 *   they mutate the model, so they re-run on their own dirtying. An unguarded
 *   one loops forever (Lexical throws "endlessly triggering additional
 *   transforms"), which is what these deletion round-trips would catch.
 * - The `<li>`s and the backref overlay are the extension's own DOM, not the
 *   reconciler's. Nothing else reclaims them.
 */
describe('lifecycle', () => {
  let editor: LexicalEditorWithDispose;
  let container: HTMLElement;

  beforeEach(() => {
    editor = buildEditorFromExtensions({
      dependencies: [FootnoteExtension, HistoryExtension],
      name: 'test-root',
      namespace: 'test',
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    editor.setRootElement(container);
  });

  afterEach(() => {
    editor.dispose();
    container.remove();
  });

  function seed(...ids: string[]): void {
    editor.update(
      () => {
        const paragraph = $createParagraphNode().append($createTextNode('x'));
        for (const id of ids) {
          paragraph.append($createFootnoteRefNode(id));
        }
        $getRoot().clear().append(paragraph);
      },
      {discrete: true},
    );
    editor.update(
      () => {
        for (const id of ids) {
          const p = $getFootnoteDefinition(id)?.getFirstChild();
          if ($isElementNode(p)) {
            p.append($createTextNode(`note ${id}`));
          }
        }
      },
      {discrete: true},
    );
  }

  function $removeRefs(footnoteId: string): void {
    for (const ref of $nodesOfType(FootnoteRefNode)) {
      if (ref.getFootnoteId() === footnoteId) {
        ref.remove();
      }
    }
  }

  function $emptyDocument(): void {
    $selectAll();
    const selection = $getSelection();
    if ($isRangeSelection(selection)) {
      selection.removeText();
    }
  }

  /**
   * The deletion rules live in a RootNode transform that diffs snapshots taken
   * at the last commit, and mutates the model — so it re-runs on its own
   * dirtying. If any branch of it acts on an already-applied deletion, Lexical
   * aborts the update with "endlessly triggering additional transforms". These
   * cycles drive every branch of it repeatedly; a loop throws rather than
   * returns a wrong value, so reaching the assertions at all is the result.
   */
  it('does not loop when the same footnote is deleted and rebuilt', () => {
    for (let round = 0; round < 3; round++) {
      seed('a', 'b');
      // Note deleted → its cues follow.
      editor.update(() => $removeFootnoteDefinition('a'), {discrete: true});
      editor.read(() => expect($getOrderedFootnoteIds()).toEqual(['b']));
      // Cue deleted → its note stays, orphaned, and cleanup takes it.
      editor.update(() => $removeRefs('b'), {discrete: true});
      editor.update(() => $cleanupOrphanFootnotes(), {discrete: true});
      editor.read(() => expect($getOrderedFootnoteIds()).toEqual([]));
    }
  });

  it('does not loop when the whole document is emptied and rebuilt', () => {
    for (let round = 0; round < 3; round++) {
      seed('a', 'b');
      editor.update($emptyDocument, {discrete: true});
      editor.read(() => expect($getFootnoteSection()).toBeNull());
      expect(
        container.querySelectorAll('[data-lexical-footnote-item]'),
      ).toHaveLength(0);
      expect(document.querySelectorAll('.lexical-footnote__backrefs')).toHaveLength(
        0,
      );
    }
  });

  it('reclaims its DOM when the root element is swapped', () => {
    seed('a');
    const next = document.createElement('div');
    document.body.appendChild(next);
    editor.setRootElement(next);

    // The old root's items and the overlay that measured against it are gone;
    // the new root carries exactly one of each.
    expect(container.querySelectorAll('[data-lexical-footnote-item]')).toHaveLength(0);
    expect(
      document.querySelectorAll('.lexical-footnote__backref-overlay'),
    ).toHaveLength(1);
    expect(next.querySelectorAll('[data-lexical-footnote-item]')).toHaveLength(1);
    next.remove();
  });

  it('leaves no overlay behind when the editor is disposed', () => {
    seed('a');
    editor.dispose();

    expect(
      document.querySelectorAll('.lexical-footnote__backref-overlay'),
    ).toHaveLength(0);
    expect(document.querySelectorAll('.lexical-footnote__backrefs')).toHaveLength(
      0,
    );
  });
});
