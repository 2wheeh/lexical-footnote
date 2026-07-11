import {
  buildEditorFromExtensions,
  type LexicalEditorWithDispose,
} from '@lexical/extension';
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
  MdastCommonMarkExtension,
  MdastExportExtension,
} from '@lexical/mdast';
import {$getRoot, $isParagraphNode} from 'lexical';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {
  $getFootnoteDefinitions,
  $getFootnoteSection,
} from '../../FootnoteExtension';
import {$isFootnoteRefNode} from '../../nodes/FootnoteRefNode';
import {FootnoteMdastExtension} from '../../mdast';

describe('mdast round-trip', () => {
  let editor: LexicalEditorWithDispose;

  beforeEach(() => {
    editor = buildEditorFromExtensions({
      dependencies: [
        MdastCommonMarkExtension,
        MdastExportExtension,
        FootnoteMdastExtension,
      ],
      name: 'test-root',
      namespace: 'test',
    });
  });

  afterEach(() => {
    editor.dispose();
  });

  it('imports GFM footnotes', () => {
    editor.update(
      () => {
        $convertFromMarkdownString(
          'hello[^note]\n\n[^note]: the footnote body\n',
        );
      },
      {discrete: true},
    );

    editor.read(() => {
      const p = $getRoot().getFirstChild();
      expect($isParagraphNode(p)).toBe(true);
      const refs = $isParagraphNode(p)
        ? p.getChildren().filter($isFootnoteRefNode)
        : [];
      expect(refs).toHaveLength(1);
      expect(refs[0]!.getFootnoteId()).toBe('note');

      const section = $getFootnoteSection();
      expect(section).not.toBeNull();
      const defs = $getFootnoteDefinitions();
      expect(defs).toHaveLength(1);
      expect(defs[0]!.getFootnoteId()).toBe('note');
      expect(defs[0]!.getTextContent()).toContain('the footnote body');
    });
  });

  it('exports GFM footnotes', () => {
    editor.update(
      () => {
        $convertFromMarkdownString(
          'hello[^note]\n\n[^note]: the footnote body\n',
        );
      },
      {discrete: true},
    );
    const markdown = editor.read(() => $convertToMarkdownString());
    expect(markdown).toContain('[^note]');
    expect(markdown).toContain('[^note]: the footnote body');
  });

  it('round-trips multiple footnotes with definition reorder', () => {
    // definitions declared in reverse order of reference
    const source =
      'first[^b] then[^a]\n\n[^a]: note a\n\n[^b]: note b\n';
    editor.update(() => $convertFromMarkdownString(source), {discrete: true});

    editor.read(() => {
      const ids = $getFootnoteDefinitions().map(def => def.getFootnoteId());
      // reordered to match reference order
      expect(ids).toEqual(['b', 'a']);
    });

    const markdown = editor.read(() => $convertToMarkdownString());
    const bIndex = markdown.indexOf('[^b]: note b');
    const aIndex = markdown.indexOf('[^a]: note a');
    expect(bIndex).toBeGreaterThan(-1);
    expect(aIndex).toBeGreaterThan(-1);
    expect(bIndex).toBeLessThan(aIndex);
  });

  it('imports a definition-only document as an orphan definition', () => {
    editor.update(
      () => $convertFromMarkdownString('[^lonely]: just a definition\n'),
      {discrete: true},
    );
    editor.read(() => {
      const defs = $getFootnoteDefinitions();
      expect(defs).toHaveLength(1);
      expect(defs[0]!.getFootnoteId()).toBe('lonely');
    });
    const markdown = editor.read(() => $convertToMarkdownString());
    expect(markdown).toContain('[^lonely]: just a definition');
  });
});
