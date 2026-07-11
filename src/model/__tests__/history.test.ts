import {
  buildEditorFromExtensions,
  getExtensionDependencyFromEditor,
  type LexicalEditorWithDispose,
} from '@lexical/extension';
import {HistoryExtension} from '@lexical/history';
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  UNDO_COMMAND,
} from 'lexical';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {FootnoteExtension} from '../../FootnoteExtension';
import {$createFootnoteRefNode} from '../../nodes/FootnoteRefNode';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe('history', () => {
  let editor: LexicalEditorWithDispose;

  beforeEach(() => {
    editor = buildEditorFromExtensions({
      dependencies: [FootnoteExtension, HistoryExtension],
      name: 'test-root',
      namespace: 'test',
    });
  });

  afterEach(() => {
    editor.dispose();
  });

  function getNumbers(): ReadonlyMap<string, number> {
    return getExtensionDependencyFromEditor(
      editor,
      FootnoteExtension,
    ).output.numbers.peek();
  }

  it('recomputes numbers after undoing a delete-all', async () => {
    editor.update(
      () => {
        const p = $createParagraphNode().append(
          $createTextNode('body'),
          $createFootnoteRefNode('undo1'),
        );
        $getRoot().clear().append(p);
      },
      {discrete: true},
    );
    expect(getNumbers().get('undo1')).toBe(1);

    // separate history entry (past the coalescing delay)
    await sleep(400);
    editor.update(
      () => {
        $getRoot().clear().append($createParagraphNode());
      },
      {discrete: true},
    );
    expect(getNumbers().has('undo1')).toBe(false);

    editor.dispatchCommand(UNDO_COMMAND, undefined);
    editor.read(() => {}); // flush the historic update's commit
    expect(getNumbers().get('undo1')).toBe(1);
  });
});
