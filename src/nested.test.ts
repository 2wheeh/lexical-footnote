import {
  buildEditorFromExtensions,
  type LexicalEditorWithDispose,
} from '@lexical/extension';
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $isElementNode,
} from 'lexical';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {
  $computeFootnoteNumbers,
  $getFootnoteDefinition,
  FootnoteExtension,
} from './FootnoteExtension';
import {$createFootnoteRefNode} from './FootnoteRefNode';

describe('a cue inside a note', () => {
  let editor: LexicalEditorWithDispose;

  beforeEach(() => {
    editor = buildEditorFromExtensions({
      dependencies: [FootnoteExtension],
      name: 'test-root',
      namespace: 'test',
    });
  });

  afterEach(() => editor.dispose());

  /**
   * Documents today's limit, so it fails loudly if it ever changes: numbering
   * walks the body with `$dfs`, which does not descend into slots — and a
   * definition IS a slot value. So a cue placed inside a note is not counted,
   * and its own note never gets a number. Nested footnotes are a roadmap item;
   * whoever takes it starts here.
   */
  it('is not numbered — $dfs does not descend into slots', () => {
    editor.update(
      () => {
        $getRoot()
          .clear()
          .append(
            $createParagraphNode().append(
              $createTextNode('body'),
              $createFootnoteRefNode('outer'),
            ),
          );
      },
      {discrete: true},
    );
    editor.update(
      () => {
        const paragraph = $getFootnoteDefinition('outer')?.getFirstChild();
        if ($isElementNode(paragraph)) {
          paragraph.append($createFootnoteRefNode('inner'));
        }
      },
      {discrete: true},
    );

    editor.read(() => {
      const numbers = $computeFootnoteNumbers();
      expect(numbers.get('outer')).toBe(1);
      expect(numbers.has('inner')).toBe(false);
    });
  });
});
