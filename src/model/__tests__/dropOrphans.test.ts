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
  configExtension,
} from 'lexical';
import {afterEach, describe, expect, it} from 'vitest';

import {$createFootnoteDefinitionNode} from '../../nodes/FootnoteDefinitionNode';
import {$getFootnoteSection, FootnoteExtension} from '../../FootnoteExtension';
import {$createFootnoteRefNode} from '../../nodes/FootnoteRefNode';
import {FootnoteMdastExtension} from '../../mdast';
import {$setDefinitionSlot} from '../slots';

/**
 * `dropOrphansOnExport` — GitHub leaves a definition nothing refers to out of
 * the HTML it renders, while GFM's *source* syntax allows it. We keep orphans
 * by default (this is a document editor, and an orphan note is content someone
 * wrote); the option exists for consumers whose HTML is a rendering and who
 * want that parity. It is an HTML-export switch only: markdown keeps the
 * definition either way, so nothing the user wrote can be lost by turning it
 * on.
 */
describe('dropOrphansOnExport', () => {
  let editor: LexicalEditorWithDispose;

  afterEach(() => {
    editor.dispose();
  });

  /** One cited note, one orphan. */
  function build(dropOrphansOnExport: boolean): void {
    editor = buildEditorFromExtensions({
      dependencies: [
        configExtension(FootnoteExtension, {dropOrphansOnExport}),
        MdastCommonMarkExtension,
        MdastGfmExtension,
        MdastExportExtension,
        FootnoteMdastExtension,
      ],
      name: 'test-root',
      namespace: 'test',
    });
    editor.update(
      () => {
        $getRoot()
          .clear()
          .append(
            $createParagraphNode().append(
              $createTextNode('body'),
              $createFootnoteRefNode('cited'),
            ),
          );
      },
      {discrete: true},
    );
    editor.update(
      () => {
        const section = $getFootnoteSection();
        const orphan = $createFootnoteDefinitionNode('orphan');
        orphan.append(
          $createParagraphNode().append($createTextNode('nobody cites me')),
        );
        if (section) {
          $setDefinitionSlot(section, 'orphan', orphan);
        }
      },
      {discrete: true},
    );
  }

  it('keeps orphans in the HTML by default', () => {
    build(false);
    const html = editor.read(() => $generateHtmlFromNodes(editor));

    expect(html).toContain('id="fn-cited"');
    expect(html).toContain('id="fn-orphan"');
  });

  it('leaves orphans out of the HTML when opted in', () => {
    build(true);
    const html = editor.read(() => $generateHtmlFromNodes(editor));

    expect(html).toContain('id="fn-cited"');
    expect(html).not.toContain('id="fn-orphan"');
    expect(html).not.toContain('nobody cites me');
  });

  it('keeps orphans in the markdown regardless — GFM allows them', () => {
    build(true);
    const markdown = editor.read(() => $convertToMarkdownString());

    expect(markdown).toContain('[^orphan]: nobody cites me');
  });
});
