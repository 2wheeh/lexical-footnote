import {buildEditorFromExtensions} from '@lexical/extension';
import {describe, expect, it} from 'vitest';

import {FootnoteExtension} from './FootnoteExtension';

describe('FootnoteExtension', () => {
  it('builds an editor', () => {
    const editor = buildEditorFromExtensions({
      dependencies: [FootnoteExtension],
      name: 'test-root',
      namespace: 'test',
    });
    expect(editor.isEditable()).toBe(true);
    editor.dispose();
  });
});
