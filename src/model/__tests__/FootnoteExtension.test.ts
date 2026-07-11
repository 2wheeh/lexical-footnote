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

import {$createFootnoteDefinitionNode} from '../../nodes/FootnoteDefinitionNode';
import {
  $getFootnoteDefinition,
  $getFootnoteDefinitions,
  $getFootnoteSection,
  FootnoteExtension,
  INSERT_FOOTNOTE_COMMAND,
} from '../../FootnoteExtension';
import {$createFootnoteRefNode, $isFootnoteRefNode} from '../../nodes/FootnoteRefNode';
import {$isFootnoteSectionNode} from '../../nodes/FootnoteSectionNode';

describe('FootnoteExtension', () => {
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

  it('builds an editor', () => {
    expect(editor.isEditable()).toBe(true);
  });

  it('inserts a ref, section, and definition via command', () => {
    editor.update(() => {
      const paragraph = $createParagraphNode();
      const text = $createTextNode('hello');
      paragraph.append(text);
      $getRoot().clear().append(paragraph);
      text.select(5, 5);
    });
    editor.dispatchCommand(INSERT_FOOTNOTE_COMMAND, undefined);

    editor.read(() => {
      const root = $getRoot();
      const section = $getFootnoteSection();
      expect(section).not.toBeNull();
      expect(root.getLastChild()).toBe(section);

      const paragraph = root.getFirstChild();
      expect($isParagraphNode(paragraph)).toBe(true);
      const refs = $isParagraphNode(paragraph)
        ? paragraph.getChildren().filter($isFootnoteRefNode)
        : [];
      expect(refs).toHaveLength(1);

      const defs = $getFootnoteDefinitions();
      expect(defs).toHaveLength(1);
      const id = defs[0]!.getFootnoteId();
      expect(id).not.toBe('');
      expect(refs[0]!.getFootnoteId()).toBe(id);
      expect(getNumbers().get(id)).toBe(1);
    });
  });

  it('numbers refs by document order and orders definitions to match', () => {
    editor.update(() => {
      const p1 = $createParagraphNode().append(
        $createTextNode('first '),
        $createFootnoteRefNode('bbb'),
      );
      const p2 = $createParagraphNode().append(
        $createTextNode('second '),
        $createFootnoteRefNode('aaa'),
      );
      $getRoot().clear().append(p1, p2);
    }, {discrete: true});

    const numbers = getNumbers();
    expect(numbers.get('bbb')).toBe(1);
    expect(numbers.get('aaa')).toBe(2);

    editor.read(() => {
      const ids = $getFootnoteDefinitions()
        .map(def => def.getFootnoteId());
      expect(ids).toEqual(['bbb', 'aaa']);
    });
  });

  it('heals a dangling ref by creating its definition', () => {
    editor.update(() => {
      const p = $createParagraphNode().append($createFootnoteRefNode('xyz'));
      $getRoot().clear().append(p);
    });
    editor.read(() => {
      const def = $getFootnoteDefinition('xyz');
      expect(def).not.toBeNull();
      expect(def!.isEmpty()).toBe(false);
    });
  });

  it('keeps orphan definitions and excludes them from numbering', () => {
    editor.update(() => {
      const p = $createParagraphNode().append(
        $createTextNode('body '),
        $createFootnoteRefNode('used'),
      );
      const orphan = $createFootnoteDefinitionNode('orphan');
      orphan.append($createParagraphNode());
      $getRoot().clear().append(p, orphan);
    });
    editor.read(() => {
      // the orphan definition got slotted onto the section, after the
      // referenced one (orphans sort last)
      const ids = $getFootnoteDefinitions().map(def => def.getFootnoteId());
      expect(ids).toEqual(['used', 'orphan']);
    });
    const numbers = getNumbers();
    expect(numbers.has('orphan')).toBe(false);
    expect(numbers.get('used')).toBe(1);
  });

  it('pins the section as last child when content is appended after it', () => {
    editor.update(() => {
      const p = $createParagraphNode().append($createFootnoteRefNode('fn1'));
      $getRoot().clear().append(p);
    });
    editor.update(() => {
      $getRoot().append($createParagraphNode().append($createTextNode('after')));
    });
    editor.read(() => {
      expect($isFootnoteSectionNode($getRoot().getLastChild())).toBe(true);
    });
  });

  it('drops numbering when the ref is removed', () => {
    editor.update(() => {
      const p = $createParagraphNode().append($createFootnoteRefNode('gone'));
      $getRoot().clear().append(p);
    }, {discrete: true});
    expect(getNumbers().get('gone')).toBe(1);
    editor.update(() => {
      const p = $getRoot().getFirstChild();
      if ($isParagraphNode(p)) {
        for (const child of p.getChildren()) {
          if ($isFootnoteRefNode(child)) {
            child.remove();
          }
        }
      }
    }, {discrete: true});
    expect(getNumbers().has('gone')).toBe(false);
  });
});
