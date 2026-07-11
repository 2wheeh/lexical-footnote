import {
  buildEditorFromExtensions,
  getExtensionDependencyFromEditor,
  type LexicalEditorWithDispose,
} from '@lexical/extension';
import {$generateHtmlFromNodes, DOMImportExtension} from '@lexical/html';
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $isParagraphNode,
} from 'lexical';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {
  $getFootnoteDefinitions,
  $getFootnoteSection,
  FootnoteExtension,
} from '../../FootnoteExtension';
import {$createFootnoteRefNode, $isFootnoteRefNode} from '../../nodes/FootnoteRefNode';

describe('HTML round-trip', () => {
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

  function $populate(): void {
    const p = $createParagraphNode().append(
      $createTextNode('hello'),
      $createFootnoteRefNode('n1'),
    );
    $getRoot().clear().append(p);
  }

  function fillDefinition(text: string): void {
    editor.update(
      () => {
        const def = $getFootnoteDefinitions()[0]!;
        const para = def.getFirstChild();
        if ($isParagraphNode(para)) {
          para.append($createTextNode(text));
        }
      },
      {discrete: true},
    );
  }

  it('exports GFM-style footnote HTML', () => {
    editor.update($populate, {discrete: true});
    fillDefinition('the note');
    const html = editor.read(() => $generateHtmlFromNodes(editor));

    expect(html).toContain('data-footnote-ref');
    expect(html).toContain('href="#fn-n1"');
    expect(html).toContain('id="fnref-n1"');
    expect(html).toContain('<sup>');
    expect(html).toContain('data-footnotes');
    expect(html).toContain('<li id="fn-n1">');
    expect(html).toContain('data-footnote-backref');
    expect(html).toContain('href="#fnref-n1"');
    expect(html).toContain('>1</a>');
    expect(html).toContain('the note');
  });

  it('imports its own exported HTML', () => {
    editor.update($populate, {discrete: true});
    fillDefinition('roundtrip note');
    const html = editor.read(() => $generateHtmlFromNodes(editor));

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const {$generateNodesFromDOM} = getExtensionDependencyFromEditor(
      editor,
      DOMImportExtension,
    ).output;

    editor.update(
      () => {
        const nodes = $generateNodesFromDOM(doc);
        $getRoot().clear().append(...nodes);
      },
      {discrete: true},
    );

    editor.read(() => {
      const root = $getRoot();
      const p = root.getFirstChild();
      expect($isParagraphNode(p)).toBe(true);
      const refs = $isParagraphNode(p)
        ? p.getChildren().filter($isFootnoteRefNode)
        : [];
      expect(refs).toHaveLength(1);
      expect(refs[0]!.getFootnoteId()).toBe('n1');

      const section = $getFootnoteSection();
      expect(section).not.toBeNull();
      const defs = $getFootnoteDefinitions();
      expect(defs).toHaveLength(1);
      expect(defs[0]!.getFootnoteId()).toBe('n1');
      expect(defs[0]!.getTextContent()).toContain('roundtrip note');
      expect(defs[0]!.getTextContent()).not.toContain('↩');
    });
  });

  it('imports GitHub-flavored HTML with user-content prefixes', () => {
    const githubHtml = `
      <p>text<sup><a href="#user-content-fn-note1" id="user-content-fnref-note1" data-footnote-ref="true">1</a></sup></p>
      <section data-footnotes="true"><ol>
        <li id="user-content-fn-note1"><p>gh note <a href="#user-content-fnref-note1" data-footnote-backref="">↩</a></p></li>
      </ol></section>`;
    const doc = new DOMParser().parseFromString(githubHtml, 'text/html');
    const {$generateNodesFromDOM} = getExtensionDependencyFromEditor(
      editor,
      DOMImportExtension,
    ).output;

    editor.update(
      () => {
        const nodes = $generateNodesFromDOM(doc);
        $getRoot().clear().append(...nodes);
      },
      {discrete: true},
    );

    editor.read(() => {
      const section = $getFootnoteSection();
      expect(section).not.toBeNull();
      const defs = $getFootnoteDefinitions();
      expect(defs).toHaveLength(1);
      expect(defs[0]!.getFootnoteId()).toBe('note1');
      expect(defs[0]!.getTextContent()).toContain('gh note');
    });
  });
});
