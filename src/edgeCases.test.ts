import {
  buildEditorFromExtensions,
  getExtensionDependencyFromEditor,
  type LexicalEditorWithDispose,
} from '@lexical/extension';
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $isParagraphNode,
} from 'lexical';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {
  $createFootnoteDefinitionNode,
  $isFootnoteDefinitionNode,
} from './FootnoteDefinitionNode';
import {
  $getFootnoteSection,
  $removeFootnote,
  FootnoteExtension,
  INSERT_FOOTNOTE_COMMAND,
} from './FootnoteExtension';
import {$createFootnoteRefNode, $isFootnoteRefNode} from './FootnoteRefNode';

describe('edge cases', () => {
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

  function getNumbers(): ReadonlyMap<string, number> {
    return getExtensionDependencyFromEditor(
      editor,
      FootnoteExtension,
    ).output.numbers.peek();
  }

  it('gives duplicate refs (copy/paste) the same number and one definition', () => {
    editor.update(
      () => {
        const p = $createParagraphNode().append(
          $createTextNode('a'),
          $createFootnoteRefNode('dup'),
          $createTextNode('b'),
          $createFootnoteRefNode('dup'),
        );
        $getRoot().clear().append(p);
      },
      {discrete: true},
    );
    expect(getNumbers().get('dup')).toBe(1);
    expect(getNumbers().size).toBe(1);
    editor.read(() => {
      const defs = $getFootnoteSection()!
        .getChildren()
        .filter($isFootnoteDefinitionNode);
      expect(defs).toHaveLength(1);
    });
  });

  it('survives a JSON serialization round-trip', () => {
    editor.update(
      () => {
        const p = $createParagraphNode().append(
          $createTextNode('body'),
          $createFootnoteRefNode('json1'),
        );
        $getRoot().clear().append(p);
      },
      {discrete: true},
    );
    const json = JSON.stringify(editor.getEditorState().toJSON());

    const editor2 = buildEditorFromExtensions({
      dependencies: [FootnoteExtension],
      name: 'test-root-2',
      namespace: 'test2',
    });
    editor2.setEditorState(editor2.parseEditorState(json));
    editor2.read(() => {
      const p = $getRoot().getFirstChild();
      const refs = $isParagraphNode(p)
        ? p.getChildren().filter($isFootnoteRefNode)
        : [];
      expect(refs).toHaveLength(1);
      expect(refs[0]!.getFootnoteId()).toBe('json1');
      const defs = $getFootnoteSection()!
        .getChildren()
        .filter($isFootnoteDefinitionNode);
      expect(defs).toHaveLength(1);
      expect(defs[0]!.getFootnoteId()).toBe('json1');
    });
    const numbers2 = getExtensionDependencyFromEditor(
      editor2,
      FootnoteExtension,
    ).output.numbers.peek();
    expect(numbers2.get('json1')).toBe(1);
    editor2.dispose();
  });

  it('$removeFootnote removes refs and definition together', () => {
    editor.update(
      () => {
        const p = $createParagraphNode().append(
          $createTextNode('x'),
          $createFootnoteRefNode('rm'),
          $createFootnoteRefNode('keep'),
        );
        $getRoot().clear().append(p);
      },
      {discrete: true},
    );
    editor.update(() => $removeFootnote('rm'), {discrete: true});
    editor.read(() => {
      const p = $getRoot().getFirstChild();
      const ids = $isParagraphNode(p)
        ? p.getChildren().filter($isFootnoteRefNode).map(r => r.getFootnoteId())
        : [];
      expect(ids).toEqual(['keep']);
      const defIds = $getFootnoteSection()!
        .getChildren()
        .filter($isFootnoteDefinitionNode)
        .map(d => d.getFootnoteId());
      expect(defIds).toEqual(['keep']);
    });
    expect(getNumbers().has('rm')).toBe(false);
    expect(getNumbers().get('keep')).toBe(1);
  });

  it('cleanupOrphans removes only unreferenced definitions', () => {
    editor.update(
      () => {
        const p = $createParagraphNode().append(
          $createTextNode('x'),
          $createFootnoteRefNode('live'),
        );
        const orphan = $createFootnoteDefinitionNode('dead');
        orphan.append($createParagraphNode());
        $getRoot().clear().append(p, orphan);
      },
      {discrete: true},
    );
    const {cleanupOrphans} = getExtensionDependencyFromEditor(
      editor,
      FootnoteExtension,
    ).output;
    expect(cleanupOrphans()).toBe(true);
    editor.read(() => {
      const ids = $getFootnoteSection()!
        .getChildren()
        .filter($isFootnoteDefinitionNode)
        .map(d => d.getFootnoteId());
      expect(ids).toEqual(['live']);
    });
    expect(cleanupOrphans()).toBe(false);
  });

  it('keeps selected text and inserts the marker after it (Word semantics)', () => {
    editor.update(
      () => {
        const p = $createParagraphNode();
        const text = $createTextNode('select me');
        p.append(text);
        $getRoot().clear().append(p);
        text.select(0, 9);
      },
      {discrete: true},
    );
    editor.dispatchCommand(INSERT_FOOTNOTE_COMMAND, undefined);
    editor.read(() => {
      const p = $getRoot().getFirstChild();
      expect($isParagraphNode(p)).toBe(true);
      if (!$isParagraphNode(p)) {
        return;
      }
      expect(p.getTextContent()).toContain('select me');
      const children = p.getChildren();
      expect($isFootnoteRefNode(children[children.length - 1])).toBe(true);
    });
  });

  it('removes the section when the last footnote is removed', () => {
    editor.update(
      () => {
        const p = $createParagraphNode().append(
          $createTextNode('x'),
          $createFootnoteRefNode('only'),
        );
        $getRoot().clear().append(p);
      },
      {discrete: true},
    );
    editor.update(() => $removeFootnote('only'), {discrete: true});
    editor.read(() => {
      expect($getFootnoteSection()).toBeNull();
    });
  });
});
