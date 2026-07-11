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
  $nodesOfType,
  $selectAll,
  DELETE_CHARACTER_COMMAND,
  UNDO_COMMAND,
} from 'lexical';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {$createFootnoteDefinitionNode} from './FootnoteDefinitionNode';
import {
  $cleanupOrphanFootnotes,
  $getFootnoteDefinition,
  $getFootnoteSection,
  $getOrderedFootnoteIds,
  FootnoteExtension,
} from './FootnoteExtension';
import {$createFootnoteRefNode, FootnoteRefNode} from './FootnoteRefNode';
import {$setDefinitionSlot} from './slots';

/**
 * Deleting a footnote. Definitions are slot values on the section: they have
 * no siblings, and no caret in the body can reach one, so none of the ordinary
 * deletion paths detach them. The policy that fills the gap:
 *
 * - deleting a cue leaves an orphan note (recoverable; a cut cue still carries
 *   its note) — $cleanupOrphanFootnotes discards orphans on demand
 * - deleting a note deletes every cue pointing at it
 * - emptying a note and deleting again deletes the note itself
 * - emptying the whole document takes the section with it
 *
 * And whatever goes, its `<li>` goes: the render override creates those, so
 * reclaiming them is ours too — the reconciler only owns the slot container
 * inside.
 */
describe('deletion', () => {
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

  /** Two body refs, `a` then `b`, each with a definition. */
  function seedTwoFootnotes(): void {
    editor.update(
      () => {
        $getRoot()
          .clear()
          .append(
            $createParagraphNode().append(
              $createTextNode('one'),
              $createFootnoteRefNode('a'),
              $createTextNode('two'),
              $createFootnoteRefNode('b'),
            ),
          );
      },
      {discrete: true},
    );
    editor.update(
      () => {
        for (const id of ['a', 'b']) {
          const paragraph = $getFootnoteDefinition(id)?.getFirstChild();
          if ($isElementNode(paragraph)) {
            paragraph.append($createTextNode(`note ${id}`));
          }
        }
      },
      {discrete: true},
    );
  }

  function $removeRefs(footnoteId: string, count = Infinity): void {
    let removed = 0;
    for (const ref of $nodesOfType(FootnoteRefNode)) {
      if (ref.getFootnoteId() === footnoteId && removed < count) {
        ref.remove();
        removed += 1;
      }
    }
  }

  function itemIds(): string[] {
    return Array.from(
      container.querySelectorAll('[data-lexical-footnote-item]'),
    ).map(li => li.getAttribute('data-lexical-footnote-item') ?? '');
  }

  it('keeps the definition as an orphan when its last ref is deleted', () => {
    seedTwoFootnotes();
    editor.update(() => $removeRefs('a'), {discrete: true});

    editor.read(() => {
      // Kept, and its text with it: deleting a cue stays recoverable, and a
      // cut cue can be pasted back onto its note. It loses its number, so the
      // derived order drops it below the notes that still have one.
      expect($getFootnoteDefinition('a')?.getTextContent()).toBe('note a');
      expect($getOrderedFootnoteIds()).toEqual(['b', 'a']);
    });
  });

  it('discards the ref-less orphan on cleanup, and reclaims its list item', () => {
    seedTwoFootnotes();
    editor.update(() => $removeRefs('a'), {discrete: true});
    expect(itemIds().sort()).toEqual(['a', 'b']);

    let removed = false;
    editor.update(
      () => {
        removed = $cleanupOrphanFootnotes();
      },
      {discrete: true},
    );

    expect(removed).toBe(true);
    editor.read(() => expect($getOrderedFootnoteIds()).toEqual(['b']));
    // The <li> the render override created for `a` is ours to reclaim — the
    // reconciler only owns the slot container inside it — or an empty
    // numbered row lingers in the list forever.
    expect(itemIds()).toEqual(['b']);
  });

  it('keeps the definition while any other ref still points at it', () => {
    editor.update(
      () => {
        $getRoot()
          .clear()
          .append(
            $createParagraphNode().append(
              $createFootnoteRefNode('a'),
              $createTextNode('x'),
              $createFootnoteRefNode('a'),
            ),
          );
      },
      {discrete: true},
    );
    editor.update(() => $removeRefs('a', 1), {discrete: true});
    editor.read(() => expect($getFootnoteDefinition('a')).not.toBeNull());
  });

  it('restores the section and its notes on undo of a select-all delete', () => {
    seedTwoFootnotes();
    editor.update(
      () => {
        $selectAll();
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          selection.removeText();
        }
      },
      {discrete: true},
    );
    editor.dispatchCommand(UNDO_COMMAND, undefined);

    editor.read(() => {
      expect($getFootnoteDefinition('a')?.getTextContent()).toBe('note a');
      expect($getOrderedFootnoteIds()).toEqual(['a', 'b']);
    });
  });

  it('leaves nothing behind when the whole document is selected and deleted', () => {
    seedTwoFootnotes();
    editor.update(
      () => {
        $selectAll();
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          selection.removeText();
        }
      },
      {discrete: true},
    );

    editor.read(() => {
      expect($getFootnoteSection()).toBeNull();
      expect($getOrderedFootnoteIds()).toEqual([]);
    });
    expect(itemIds()).toEqual([]);
  });

  it('cleans up an orphan definition without disturbing the others', () => {
    seedTwoFootnotes();
    // An imported orphan: a definition that never had a ref (legal in GFM),
    // so ref-deletion propagation never sees it. Only cleanup removes it.
    editor.update(
      () => {
        const section = $getFootnoteSection();
        const orphan = $createFootnoteDefinitionNode('orphan');
        orphan.append($createParagraphNode().append($createTextNode('lost')));
        if (section) {
          $setDefinitionSlot(section, 'orphan', orphan);
        }
      },
      {discrete: true},
    );
    expect(itemIds().sort()).toEqual(['a', 'b', 'orphan']);

    let removed = false;
    editor.update(
      () => {
        removed = $cleanupOrphanFootnotes();
      },
      {discrete: true},
    );

    expect(removed).toBe(true);
    editor.read(() => {
      expect($getFootnoteDefinition('orphan')).toBeNull();
      expect($getOrderedFootnoteIds()).toEqual(['a', 'b']);
    });
    expect(itemIds().sort()).toEqual(['a', 'b']);
  });

  it('deletes an emptied note on the next delete, and its refs with it', () => {
    seedTwoFootnotes();
    // Empty note `a`, caret inside it — the state a user reaches by selecting
    // the note's text and deleting it.
    editor.update(
      () => {
        const paragraph = $getFootnoteDefinition('a')?.getFirstChild();
        if ($isElementNode(paragraph)) {
          paragraph.clear();
          paragraph.selectStart();
        }
      },
      {discrete: true},
    );
    editor.dispatchCommand(DELETE_CHARACTER_COMMAND, true);

    editor.read(() => {
      expect($getFootnoteDefinition('a')).toBeNull();
      expect($getOrderedFootnoteIds()).toEqual(['b']);
      // Deleting the note deletes what pointed at it.
      expect(
        [...$nodesOfType(FootnoteRefNode)].map(ref => ref.getFootnoteId()),
      ).toEqual(['b']);
    });
    expect(itemIds()).toEqual(['b']);
  });

  it('keeps a definitions-only document, which was never emptied by an edit', () => {
    // The empty-body rule fires on an edit that removes the last ref, not on
    // a state that simply arrives ref-less — importing nothing but footnote
    // definitions is legal, and must not delete them on arrival.
    editor.update(
      () => {
        $getRoot().clear().append($createParagraphNode());
        const orphan = $createFootnoteDefinitionNode('orphan');
        orphan.append($createParagraphNode().append($createTextNode('lost')));
        $getRoot().append(orphan);
      },
      {discrete: true},
    );
    editor.read(() => {
      expect($getFootnoteSection()).not.toBeNull();
      expect($getFootnoteDefinition('orphan')?.getTextContent()).toBe('lost');
    });
  });

  it('numbers the list items by derived order, not slot-map order', () => {
    // Slot names sort by code unit, so the DOM order of the <li>s is not the
    // display order; the marker has to be told the number explicitly.
    editor.update(
      () => {
        $getRoot()
          .clear()
          .append(
            $createParagraphNode().append(
              $createFootnoteRefNode('z'),
              $createTextNode('x'),
              $createFootnoteRefNode('a'),
            ),
          );
      },
      {discrete: true},
    );
    const items = Array.from(
      container.querySelectorAll<HTMLLIElement>('[data-lexical-footnote-item]'),
    );
    const numbering = new Map(
      items.map(li => [li.getAttribute('data-lexical-footnote-item'), li.value]),
    );
    expect(numbering.get('z')).toBe(1);
    expect(numbering.get('a')).toBe(2);
  });
});
