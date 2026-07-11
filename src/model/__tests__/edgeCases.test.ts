import {
  buildEditorFromExtensions,
  getExtensionDependencyFromEditor,
  type LexicalEditorWithDispose,
} from '@lexical/extension';
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isNodeSelection,
  $isParagraphNode,
  $isRangeSelection,
  DELETE_CHARACTER_COMMAND,
} from 'lexical';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {$createFootnoteDefinitionNode} from '../../nodes/FootnoteDefinitionNode';
import {
  $getFootnoteDefinitions,
  $getFootnoteSection,
  $removeFootnote,
  $removeFootnoteDefinition,
  FootnoteExtension,
  INSERT_FOOTNOTE_COMMAND,
} from '../../FootnoteExtension';
import {$createFootnoteRefNode, $isFootnoteRefNode} from '../../nodes/FootnoteRefNode';

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
      const defs = $getFootnoteDefinitions();
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
      const defs = $getFootnoteDefinitions();
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
      const defIds = $getFootnoteDefinitions()
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
      const ids = $getFootnoteDefinitions()
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

  it('backspace at a cue boundary selects the cue instead of deleting it', () => {
    editor.update(
      () => {
        const before = $createTextNode('before ');
        const after = $createTextNode('after');
        const p = $createParagraphNode().append(
          before,
          $createFootnoteRefNode('sel'),
          after,
        );
        $getRoot().clear().append(p);
        after.select(0, 0);
      },
      {discrete: true},
    );
    editor.dispatchCommand(DELETE_CHARACTER_COMMAND, true);
    editor.read(() => {
      const selection = $getSelection();
      expect($isNodeSelection(selection)).toBe(true);
      const nodes = selection!.getNodes();
      expect(nodes).toHaveLength(1);
      expect($isFootnoteRefNode(nodes[0])).toBe(true);
      // cue still present
      const p = $getRoot().getFirstChild();
      const refs = $isParagraphNode(p)
        ? p.getChildren().filter($isFootnoteRefNode)
        : [];
      expect(refs).toHaveLength(1);
    });
  });

  it('backspace mid-text does not hijack deletion', () => {
    editor.update(
      () => {
        const after = $createTextNode('after');
        const p = $createParagraphNode().append(
          $createFootnoteRefNode('sel2'),
          after,
        );
        $getRoot().clear().append(p);
        after.select(2, 2);
      },
      {discrete: true},
    );
    editor.dispatchCommand(DELETE_CHARACTER_COMMAND, true);
    editor.read(() => {
      expect($isRangeSelection($getSelection())).toBe(true);
    });
  });

  it('deleting a definition removes its refs in the same update', () => {
    editor.update(
      () => {
        const p = $createParagraphNode().append(
          $createTextNode('x'),
          $createFootnoteRefNode('bye'),
          $createFootnoteRefNode('stay'),
        );
        $getRoot().clear().append(p);
      },
      {discrete: true},
    );
    // Definitions are slot values: they are removed through the slot map,
    // not with node.remove() (a children-channel operation).
    editor.update(() => $removeFootnoteDefinition('bye'), {discrete: true});
    editor.read(() => {
      const p = $getRoot().getFirstChild();
      const ids = $isParagraphNode(p)
        ? p.getChildren().filter($isFootnoteRefNode).map(r => r.getFootnoteId())
        : [];
      expect(ids).toEqual(['stay']);
    });
    expect(getNumbers().has('bye')).toBe(false);
  });

  it('materializes a cue when literal [^id] is typed', () => {
    editor.update(
      () => {
        const p = $createParagraphNode().append(
          $createTextNode('see[^tip] more'),
        );
        $getRoot().clear().append(p);
      },
      {discrete: true},
    );
    editor.read(() => {
      const p = $getRoot().getFirstChild();
      expect($isParagraphNode(p)).toBe(true);
      if (!$isParagraphNode(p)) {
        return;
      }
      expect(p.getChildren().some($isFootnoteRefNode)).toBe(true);
      const ref = p.getChildren().find($isFootnoteRefNode)!;
      expect(ref.getFootnoteId()).toBe('tip');
      // surrounding text preserved
      expect(p.getTextContent()).toContain('see');
      expect(p.getTextContent()).toContain(' more');
      // definition healed into existence
      expect($getFootnoteSection()).not.toBeNull();
    });
    expect(getNumbers().get('tip')).toBe(1);
  });

  it('does not convert [^id] inside code-formatted text', () => {
    editor.update(
      () => {
        const text = $createTextNode('const a = "[^x]"');
        text.toggleFormat('code');
        $getRoot().clear().append($createParagraphNode().append(text));
      },
      {discrete: true},
    );
    editor.read(() => {
      const p = $getRoot().getFirstChild();
      const hasRef =
        $isParagraphNode(p) && p.getChildren().some($isFootnoteRefNode);
      expect(hasRef).toBe(false);
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
