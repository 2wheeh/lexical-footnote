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
import {$getRoot, $isParagraphNode, $nodesOfType} from 'lexical';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {
  $getFootnoteDefinitions,
  $getFootnoteSection,
} from '../../FootnoteExtension';
import {$isFootnoteRefNode, FootnoteRefNode} from '../../nodes/FootnoteRefNode';
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
    const source = 'first[^b] then[^a]\n\n[^a]: note a\n\n[^b]: note b\n';
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

describe('mdast formatted-cue round-trip', () => {
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

  const load = (source: string): void => {
    editor.update(() => $convertFromMarkdownString(source), {discrete: true});
  };

  const exportMarkdown = (): string =>
    editor.read(() => $convertToMarkdownString());

  /** The format flags of the single cue in the document, or throws. */
  const refFormats = () =>
    editor.read(() => {
      const refs = $nodesOfType(FootnoteRefNode);
      expect(refs).toHaveLength(1);
      const ref = refs[0]!;
      return {
        bold: ref.hasFormat('bold'),
        italic: ref.hasFormat('italic'),
        strikethrough: ref.hasFormat('strikethrough'),
      };
    });

  it('applies surrounding bold to an imported cue', () => {
    load('**x[^a]**\n\n[^a]: note a\n');
    expect(refFormats().bold).toBe(true);
  });

  it('applies surrounding italic to an imported cue', () => {
    load('*x[^a]* y\n\n[^a]: note a\n');
    expect(refFormats().italic).toBe(true);
  });

  it('leaves a plain cue unformatted (regression guard)', () => {
    load('x[^a] y\n\n[^a]: note a\n');
    const formats = refFormats();
    expect(formats.bold).toBe(false);
    expect(formats.italic).toBe(false);
    expect(formats.strikethrough).toBe(false);
    // Plain cue survives the round trip without stray wrappers.
    expect(exportMarkdown()).toContain('x[^a] y');
  });

  it('exports a bold cue re-wrapped and merged with adjacent bold text', () => {
    load('**x[^a]**\n\n[^a]: note a\n');
    const markdown = exportMarkdown();
    // The cue keeps its bold, folded into the neighbouring bold run rather
    // than emitted as a separate, un-parseable `**x****[^a]**` wrapper.
    expect(markdown).toContain('**x[^a]**');
    expect(markdown).not.toContain('****');
  });

  it('round-trips a bold cue stably (export re-parses to the same tree)', () => {
    load('**x[^a]**\n\n[^a]: note a\n');
    const first = exportMarkdown();
    // Re-import the exported markdown into a fresh document and re-export.
    load(first);
    expect(refFormats().bold).toBe(true);
    expect(exportMarkdown()).toBe(first);
  });

  it('round-trips an italic cue followed by text stably', () => {
    load('*x[^a]* y\n\n[^a]: note a\n');
    const first = exportMarkdown();
    expect(first).toContain('*x[^a]*');
    expect(first).not.toContain('**a**');
    load(first);
    expect(refFormats().italic).toBe(true);
    expect(exportMarkdown()).toBe(first);
  });

  it('merges same-format text on both sides of a cue', () => {
    load('**x[^a]y**\n\n[^a]: note a\n');
    const markdown = exportMarkdown();
    expect(markdown).toContain('**x[^a]y**');
    expect(markdown).not.toContain('****');
    load(markdown);
    expect(refFormats().bold).toBe(true);
    expect(exportMarkdown()).toBe(markdown);
  });
});
