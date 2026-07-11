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

import {ClipboardImportExtension} from '@lexical/clipboard';
import {HorizontalRuleExtension} from '@lexical/extension';
import {$getSelection, $isRangeSelection} from 'lexical';

import {FootnoteClipboardExtension} from './clipboard';
import {
  $getFootnoteDefinitions,
  FootnoteExtension,
} from './FootnoteExtension';
import {$createFootnoteRefNode, $isFootnoteRefNode} from './FootnoteRefNode';

/**
 * Microsoft Word puts this on the clipboard as text/html — including its
 * footnote-area separator chrome (`<br clear=all><hr>`) inside the
 * footnote-list container.
 */
const WORD_HTML = `
<html xmlns:w="urn:schemas-microsoft-com:office:word"><body>
<p class="MsoNormal">Body text with a note<a href="#_ftn1" name="_ftnref1"><span class="MsoFootnoteReference">[1]</span></a> and more.</p>
<div style="mso-element:footnote-list">
  <br clear="all">
  <hr align="left" size="1" width="33%">
  <div style="mso-element:footnote" id="ftn1">
    <p class="MsoFootnoteText"><a href="#_ftnref1" name="_ftn1"><span class="MsoFootnoteReference">[1]</span></a> The footnote body from Word.</p>
  </div>
</div>
</body></html>`;

/**
 * The same Word content pasted through Safari, whose WebKit clipboard
 * sanitization rewrites hrefs to absolute applewebdata:// URLs and strips
 * the mso-element styles (classes like MsoFootnoteText survive). Captured
 * from a real Safari paste.
 */
const SAFARI_WORD_HTML = `
<html xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="UTF-8"></head>
<p class="MsoNormal"><span lang="EN-US">Body text with a note<a href="applewebdata://E396ADD8-DC93-4910-B26F-ABC040744F04#_ftn1" name="_ftnref1" title=""><span class="MsoFootnoteReference" style="vertical-align: super;"><span><span class="MsoFootnoteReference"><span lang="EN-US">[1]</span></span></span></span></a> and more.<o:p></o:p></span></p>
<div style="caret-color: rgb(0, 0, 0); color: rgb(0, 0, 0);"><br clear="all"><hr align="left" size="1" width="33%"><div id="ftn1"><p class="MsoFootnoteText"><a href="applewebdata://E396ADD8-DC93-4910-B26F-ABC040744F04#_ftnref1" name="_ftn1" title=""><span class="MsoFootnoteReference"><span lang="EN-US">[1]</span></span></a><span lang="EN-US"><span class="Apple-converted-space"> </span>The footnote body from Safari.<o:p></o:p></span></p></div></div></html>`;

/** Google Docs identifies notes by a leading anchor, not a container. */
const GDOCS_HTML = `
<p>Body text with a note<sup><a href="#ftnt1" id="ftnt_ref1">[1]</a></sup> and more.</p>
<hr>
<div><p><a href="#ftnt_ref1" id="ftnt1">[1]</a> The footnote body from Google Docs.</p></div>`;

describe('word/google-docs clipboard import', () => {
  let editor: LexicalEditorWithDispose;

  beforeEach(() => {
    editor = buildEditorFromExtensions({
      // HorizontalRuleExtension is registered so a source-app separator
      // <hr> WOULD materialize if the import rules failed to drop it.
      dependencies: [FootnoteExtension, HorizontalRuleExtension],
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
        $getFootnoteDefinitions();
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
    ['Word via Safari', SAFARI_WORD_HTML, 'The footnote body from Safari.'],
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
    // the source app's footnote-area separator (<hr>) is chrome, not content
    editor.read(() => {
      const types = $getRoot()
        .getChildren()
        .map(child => child.getType());
      expect(types).not.toContain('horizontalrule');
    });
  });

  it('duplicates footnotes when the same content is pasted twice', () => {
    pasteHtml(WORD_HTML);
    pasteHtml(WORD_HTML, true);

    const {refIds, defIds} = readImported();
    expect(refIds).toHaveLength(2);
    // two import passes must not share generated ids
    expect(new Set(refIds).size).toBe(2);
    expect(defIds).toHaveLength(2);
  });

  it('routes real clipboard pastes through the import rules (FootnoteClipboardExtension)', () => {
    const pasteEditor = buildEditorFromExtensions({
      dependencies: [FootnoteClipboardExtension],
      name: 'paste-root',
      namespace: 'paste',
    });
    const {$insertDataTransfer} = getExtensionDependencyFromEditor(
      pasteEditor,
      ClipboardImportExtension,
    ).output;
    const dataTransfer = {
      getData: (type: string) => (type === 'text/html' ? WORD_HTML : ''),
      types: ['text/html'],
    } as unknown as DataTransfer;

    pasteEditor.update(
      () => {
        const p = $createParagraphNode().append($createTextNode('target '));
        $getRoot().clear().append(p);
        p.selectEnd();
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          $insertDataTransfer(dataTransfer, selection);
        }
      },
      {discrete: true},
    );

    pasteEditor.read(() => {
      const refs: string[] = [];
      for (const child of $getRoot().getChildren()) {
        if ($isParagraphNode(child)) {
          for (const inline of child.getChildren()) {
            if ($isFootnoteRefNode(inline)) {
              refs.push(inline.getFootnoteId());
            }
          }
        }
      }
      expect(refs).toHaveLength(1);
      const defs =
        $getFootnoteDefinitions();
      expect(defs.map(def => def.getFootnoteId())).toEqual(refs);
      expect(defs[0]!.getTextContent()).toContain(
        'The footnote body from Word.',
      );
    });
    pasteEditor.dispose();
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
