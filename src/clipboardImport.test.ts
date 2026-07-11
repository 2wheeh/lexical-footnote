import {
  buildEditorFromExtensions,
  getExtensionDependencyFromEditor,
  type LexicalEditorWithDispose,
} from '@lexical/extension';
import {DOMImportExtension} from '@lexical/html';
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $isParagraphNode,
} from 'lexical';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {$isFootnoteDefinitionNode} from './FootnoteDefinitionNode';
import {$getFootnoteSection, FootnoteExtension} from './FootnoteExtension';
import {$createFootnoteRefNode, $isFootnoteRefNode} from './FootnoteRefNode';

/** Microsoft Word puts this on the clipboard as text/html. */
const WORD_HTML = `
<html xmlns:w="urn:schemas-microsoft-com:office:word"><body>
<p class="MsoNormal">Body text with a note<a href="#_ftn1" name="_ftnref1"><span class="MsoFootnoteReference">[1]</span></a> and more.</p>
<div style="mso-element:footnote-list">
  <div style="mso-element:footnote" id="ftn1">
    <p class="MsoFootnoteText"><a href="#_ftnref1" name="_ftn1"><span class="MsoFootnoteReference">[1]</span></a> The footnote body from Word.</p>
  </div>
</div>
</body></html>`;

/** Google Docs identifies notes by a leading anchor, not a container. */
const GDOCS_HTML = `
<p>Body text with a note<sup><a href="#ftnt1" id="ftnt_ref1">[1]</a></sup> and more.</p>
<hr>
<div><p><a href="#ftnt_ref1" id="ftnt1">[1]</a> The footnote body from Google Docs.</p></div>`;

describe('word/google-docs clipboard import', () => {
  let editor: LexicalEditorWithDispose;

  beforeEach(() => {
    editor = buildEditorFromExtensions({
      dependencies: [FootnoteExtension],
      name: 'test-root',
      namespace: 'test',
    });
  });

  afterEach(() => {
    editor.dispose();
  });

  function pasteHtml(html: string, keepExisting = false): void {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const {$generateNodesFromDOM} = getExtensionDependencyFromEditor(
      editor,
      DOMImportExtension,
    ).output;
    editor.update(
      () => {
        const nodes = $generateNodesFromDOM(doc);
        const root = $getRoot();
        if (!keepExisting) {
          root.clear();
        }
        root.append(...nodes);
      },
      {discrete: true},
    );
  }

  function readImported(): {
    refIds: string[];
    defIds: string[];
    defText: string;
    bodyText: string;
  } {
    return editor.read(() => {
      const root = $getRoot();
      const refIds: string[] = [];
      for (const child of root.getChildren()) {
        if ($isParagraphNode(child)) {
          for (const inline of child.getChildren()) {
            if ($isFootnoteRefNode(inline)) {
              refIds.push(inline.getFootnoteId());
            }
          }
        }
      }
      const defs =
        $getFootnoteSection()?.getChildren().filter($isFootnoteDefinitionNode) ??
        [];
      const bodyParagraph = root.getFirstChild();
      return {
        bodyText: $isParagraphNode(bodyParagraph)
          ? bodyParagraph.getTextContent()
          : '',
        defIds: defs.map(def => def.getFootnoteId()),
        defText: defs.map(def => def.getTextContent()).join('\n'),
        refIds,
      };
    });
  }

  it.each([
    ['Word', WORD_HTML, 'The footnote body from Word.'],
    ['Google Docs', GDOCS_HTML, 'The footnote body from Google Docs.'],
  ])('imports footnotes pasted from %s', (_label, html, body) => {
    pasteHtml(html);
    const {refIds, defIds, defText, bodyText} = readImported();

    expect(refIds).toHaveLength(1);
    expect(defIds).toEqual(refIds);
    expect(defText).toContain(body);
    expect(bodyText).toContain('Body text with a note');
    expect(bodyText).toContain('and more.');
    // the source's literal "[1]" marker and its backref anchor are dropped
    expect(defText).not.toContain('[1]');
  });

  it('assigns fresh ids so a paste cannot collide with existing footnotes', () => {
    editor.update(
      () => {
        // a document that already uses the identifier Word would emit
        const p = $createParagraphNode().append(
          $createTextNode('existing'),
          $createFootnoteRefNode('1'),
        );
        $getRoot().clear().append(p);
      },
      {discrete: true},
    );
    pasteHtml(WORD_HTML, true);

    const {refIds, defIds, defText} = readImported();
    expect(refIds).toHaveLength(2);
    expect(new Set(refIds).size).toBe(2);
    expect(refIds).toContain('1');
    expect(defIds).toHaveLength(2);
    // the pasted note kept its own definition rather than merging into "1"
    expect(defText).toContain('The footnote body from Word.');
  });
});
