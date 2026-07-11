import {
  buildEditorFromExtensions,
  type LexicalEditorWithDispose,
} from '@lexical/extension';
import {RichTextExtension} from '@lexical/rich-text';
import {userEvent} from '@vitest/browser/context';
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $isElementNode,
} from 'lexical';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {$getFootnoteDefinition, FootnoteExtension} from '../FootnoteExtension';
import {$createFootnoteRefNode} from '../nodes/FootnoteRefNode';

/**
 * Caret movement between notes, in real engines.
 *
 * Each note is an editable island — a slot container with its own
 * `contentEditable` — and the engines disagree about arrow keys at an island's
 * boundary: Firefox will not carry the caret out of one (it only walks to the
 * island's own start and end, leaving the notes a keyboard dead end), while
 * Chrome and Safari cross. So the extension moves between notes itself, in
 * every browser, and this is where that is checked. happy-dom has no caret and
 * cannot see any of this.
 */
describe('caret movement between notes', () => {
  let editor: LexicalEditorWithDispose;
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    editor = buildEditorFromExtensions({
      dependencies: [RichTextExtension, FootnoteExtension],
      name: 'test-root',
      namespace: 'test',
    });
    editor.setRootElement(container);
    editor.update(
      () => {
        $getRoot()
          .clear()
          .append(
            $createParagraphNode().append(
              $createTextNode('body'),
              $createFootnoteRefNode('a'),
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
  });

  afterEach(() => {
    editor.dispose();
    container.remove();
  });

  /** Which note the caret is in, or null when it is in the body. */
  function caretNote(): string | null {
    const anchor = window.getSelection()?.anchorNode ?? null;
    const element =
      anchor instanceof Element ? anchor : (anchor?.parentElement ?? null);
    return (
      element
        ?.closest('[data-lexical-footnote-def]')
        ?.getAttribute('data-lexical-footnote-def') ?? null
    );
  }

  async function clickIntoNote(footnoteId: string): Promise<void> {
    const note = container.querySelector(
      `[data-lexical-footnote-def="${footnoteId}"] p`,
    );
    if (!(note instanceof HTMLElement)) {
      throw new Error(`no note ${footnoteId}`);
    }
    await userEvent.click(note);
  }

  it('walks down from one note into the next', async () => {
    await clickIntoNote('a');
    expect(caretNote()).toBe('a');

    await userEvent.keyboard('{ArrowDown}');

    expect(caretNote()).toBe('b');
  });

  it('walks back up into the previous note, then out into the body', async () => {
    await clickIntoNote('b');

    await userEvent.keyboard('{ArrowUp}');
    expect(caretNote()).toBe('a');

    await userEvent.keyboard('{ArrowUp}');
    expect(caretNote()).toBeNull();
  });

  it('types into the note the caret landed in', async () => {
    await clickIntoNote('a');
    await userEvent.keyboard('{ArrowDown}');
    await userEvent.keyboard('!');

    // Down lands at the start of the next note (up lands at the end of the
    // previous one), so the keystroke goes in at the front — and it goes into
    // the model, which is what proves the island is genuinely editable and
    // that the caret really moved rather than the note merely looking focused.
    expect(editor.read(() => $getFootnoteDefinition('b')?.getTextContent())).toBe(
      '!note b',
    );
    expect(editor.read(() => $getFootnoteDefinition('a')?.getTextContent())).toBe(
      'note a',
    );
  });

  it('lands at the end of the previous note when walking up', async () => {
    await clickIntoNote('b');
    await userEvent.keyboard('{ArrowUp}');
    await userEvent.keyboard('!');

    expect(editor.read(() => $getFootnoteDefinition('a')?.getTextContent())).toBe(
      'note a!',
    );
  });
});
