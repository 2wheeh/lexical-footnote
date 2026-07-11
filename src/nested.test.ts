import {
  buildEditorFromExtensions,
  type LexicalEditorWithDispose,
} from '@lexical/extension';
import {$generateHtmlFromNodes} from '@lexical/html';
import {
  $convertToMarkdownString,
  MdastCommonMarkExtension,
  MdastExportExtension,
  MdastGfmExtension,
} from '@lexical/mdast';
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $isElementNode,
} from 'lexical';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {$createFootnoteDefinitionNode} from './FootnoteDefinitionNode';
import {
  $cleanupOrphanFootnotes,
  $computeFootnoteNumbers,
  $getFootnoteDefinition,
  $getFootnoteSection,
  $getOrderedFootnoteIds,
  FootnoteExtension,
} from './FootnoteExtension';
import {$createFootnoteRefNode} from './FootnoteRefNode';
import {FootnoteMdastExtension} from './mdast';
import {$setDefinitionSlot} from './slots';

/**
 * A note may cite another note. GFM discovers those with a loop whose bounds
 * grow as it runs — rendering a note's content appends whatever it cites to the
 * very list being iterated — so a note reached only from inside another note is
 * numbered right after it, and lands after it in the list.
 */
describe('a cue inside a note', () => {
  let editor: LexicalEditorWithDispose;

  beforeEach(() => {
    editor = buildEditorFromExtensions({
      dependencies: [
        FootnoteExtension,
        MdastCommonMarkExtension,
        MdastGfmExtension,
        MdastExportExtension,
        FootnoteMdastExtension,
      ],
      name: 'test-root',
      namespace: 'test',
    });
  });

  afterEach(() => editor.dispose());

  /** Cites `ids` from the body, in order. */
  function $body(...ids: string[]): void {
    const paragraph = $createParagraphNode().append($createTextNode('body'));
    for (const id of ids) {
      paragraph.append($createFootnoteRefNode(id));
    }
    $getRoot().clear().append(paragraph);
  }

  /** Appends text, then cues, to a note. */
  function $writeNote(footnoteId: string, text: string, ...cites: string[]) {
    const paragraph = $getFootnoteDefinition(footnoteId)?.getFirstChild();
    if ($isElementNode(paragraph)) {
      paragraph.append($createTextNode(text));
      for (const id of cites) {
        paragraph.append($createFootnoteRefNode(id));
      }
    }
  }

  it('numbers the note it cites right after itself', () => {
    editor.update(() => $body('a', 'b'), {discrete: true});
    editor.update(() => $writeNote('a', 'note a cites ', 'c'), {
      discrete: true,
    });

    editor.read(() => {
      const numbers = $computeFootnoteNumbers();
      // Body cues first, then what the notes cite, in the order the notes are
      // read: a=1, b=2, and c — reachable only from inside a — is 3.
      expect([...numbers]).toEqual([
        ['a', 1],
        ['b', 2],
        ['c', 3],
      ]);
      // The list follows the numbering.
      expect($getOrderedFootnoteIds()).toEqual(['a', 'b', 'c']);
    });
  });

  it('terminates on a cycle, and on a note citing itself', () => {
    editor.update(() => $body('a'), {discrete: true});
    editor.update(
      () => {
        $writeNote('a', 'a cites b ', 'b');
      },
      {discrete: true},
    );
    editor.update(
      () => {
        // b cites a right back, and a again cites itself.
        $writeNote('b', 'b cites a ', 'a');
        $writeNote('a', ' and itself ', 'a');
      },
      {discrete: true},
    );

    editor.read(() => {
      expect([...$computeFootnoteNumbers()]).toEqual([
        ['a', 1],
        ['b', 2],
      ]);
      // An id is enqueued the first time it is seen and never again, so the
      // cycle closes. A self-citation is simply a second cue for that note.
      expect($getFootnoteDefinition('a')?.getTextContent()).toContain('itself');
    });
  });

  it('gives a note cited from inside another note its own backref', () => {
    editor.update(() => $body('a'), {discrete: true});
    editor.update(() => $writeNote('a', 'see ', 'c'), {discrete: true});
    const html = editor.read(() => $generateHtmlFromNodes(editor));

    // c is a real footnote: it has a list item, and its backref leads to the
    // cue that cites it — which lives inside note a.
    expect(html).toContain('<li id="fn-c">');
    expect(html).toContain('id="fnref-c"');
    expect(html).toContain('href="#fnref-c"');
  });

  it('round-trips a nested cue through markdown', () => {
    editor.update(() => $body('a'), {discrete: true});
    editor.update(() => $writeNote('a', 'see ', 'c'), {discrete: true});

    const markdown = editor.read(() => $convertToMarkdownString());

    expect(markdown).toContain('[^a]: see [^c]');
    expect(markdown).toContain('[^c]:');
  });

  it('numbers cues inside an orphan note, which GitHub never has to', () => {
    editor.update(() => $body('a'), {discrete: true});
    editor.update(
      () => {
        // An orphan: nothing cites it. It stays (we keep orphans), it is
        // visible, and it cites another note from inside itself.
        const section = $getFootnoteSection();
        const orphan = $createFootnoteDefinitionNode('z');
        orphan.append(
          $createParagraphNode().append(
            $createTextNode('orphan cites '),
            $createFootnoteRefNode('w'),
          ),
        );
        if (section) {
          $setDefinitionSlot(section, 'z', orphan);
        }
      },
      {discrete: true},
    );

    editor.read(() => {
      const numbers = $computeFootnoteNumbers();
      // The cue inside the orphan is numbered — a visible note whose own cue
      // rendered as `?` would look broken. The orphan itself stays unnumbered,
      // because nothing cites it, and so sorts last.
      expect(numbers.get('a')).toBe(1);
      expect(numbers.get('w')).toBe(2);
      expect(numbers.has('z')).toBe(false);
      expect($getOrderedFootnoteIds()).toEqual(['a', 'w', 'z']);
    });
  });

  it('keeps a note that only a nested cue refers to, on cleanup', () => {
    editor.update(() => $body('a'), {discrete: true});
    editor.update(() => $writeNote('a', 'see ', 'c'), {discrete: true});

    let removed = false;
    editor.update(
      () => {
        removed = $cleanupOrphanFootnotes();
      },
      {discrete: true},
    );

    // c has no cue in the body, but it is cited — from inside note a — so it
    // is not an orphan.
    expect(removed).toBe(false);
    editor.read(() => expect($getOrderedFootnoteIds()).toEqual(['a', 'c']));
  });
});
