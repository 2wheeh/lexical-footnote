import {
  $exportMimeTypeFromSelection,
  $generateNodesFromSerializedNodes,
  $insertGeneratedNodes,
  ClipboardImportExtension,
} from '@lexical/clipboard';
import {
  buildEditorFromExtensions,
  getExtensionDependencyFromEditor,
  type LexicalEditorWithDispose,
} from '@lexical/extension';
import {$generateDOMFromRoot} from '@lexical/html';
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isParagraphNode,
  $isRangeSelection,
  type ParagraphNode,
  type SerializedLexicalNode,
} from 'lexical';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {FootnoteClipboardExtension} from '../../clipboard';
import {
  $getFootnoteDefinition,
  $getFootnoteDefinitions,
} from '../../FootnoteExtension';
import {
  $createFootnoteRefNode,
  $isFootnoteRefNode,
} from '../../nodes/FootnoteRefNode';

/**
 * Copy carries the notes a selection references; paste re-keys a carried
 * note when its id already names a different note. See io/clipboardCarry.ts.
 */
describe('clipboard carry', () => {
  let editor: LexicalEditorWithDispose;

  function buildEditor(name: string): LexicalEditorWithDispose {
    return buildEditorFromExtensions({
      dependencies: [FootnoteClipboardExtension],
      name,
      namespace: 'carry-test',
    });
  }

  /** `body [^a] tail` / `other [^b]` with notes "note A" / "note B". */
  function seed(target: LexicalEditorWithDispose): void {
    target.update(
      () => {
        const body = $createParagraphNode().append(
          $createTextNode('body '),
          $createFootnoteRefNode('a'),
          $createTextNode(' tail'),
        );
        const other = $createParagraphNode().append(
          $createTextNode('other '),
          $createFootnoteRefNode('b'),
        );
        $getRoot().clear().append(body, other);
      },
      {discrete: true},
    );
    target.update(
      () => {
        for (const [id, text] of [
          ['a', 'note A'],
          ['b', 'note B'],
        ] as const) {
          $getFootnoteDefinition(id)!
            .getFirstChild<ParagraphNode>()!
            .append($createTextNode(text));
        }
      },
      {discrete: true},
    );
  }

  /** Serializes the selection over the first (or given) paragraph. */
  function copyFirstParagraph(
    target: LexicalEditorWithDispose,
    mimeType: 'text/html' | 'application/x-lexical-editor',
  ): string | null {
    let payload: string | null = null;
    target.update(
      () => {
        const paragraph = $getRoot().getFirstChild<ParagraphNode>()!;
        const selection = paragraph.select(0, paragraph.getChildrenSize());
        payload = $exportMimeTypeFromSelection(mimeType, selection);
      },
      {discrete: true},
    );
    return payload;
  }

  function copyAll(
    target: LexicalEditorWithDispose,
    mimeType: 'text/html' | 'application/x-lexical-editor',
  ): string | null {
    let payload: string | null = null;
    target.update(
      () => {
        const root = $getRoot();
        const selection = root.select(0, root.getChildrenSize());
        payload = $exportMimeTypeFromSelection(mimeType, selection);
      },
      {discrete: true},
    );
    return payload;
  }

  function pasteJSON(target: LexicalEditorWithDispose, payload: string): void {
    const {nodes} = JSON.parse(payload) as {nodes: SerializedLexicalNode[]};
    target.update(
      () => {
        const paragraph = $createParagraphNode().append(
          $createTextNode('target '),
        );
        $getRoot().append(paragraph);
        paragraph.selectEnd();
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          $insertGeneratedNodes(
            target,
            $generateNodesFromSerializedNodes(nodes),
            selection,
          );
        }
      },
      {discrete: true},
    );
  }

  function readRefIds(target: LexicalEditorWithDispose): string[] {
    return target.read(() => {
      const ids: string[] = [];
      for (const child of $getRoot().getChildren()) {
        if ($isParagraphNode(child)) {
          for (const inline of child.getChildren()) {
            if ($isFootnoteRefNode(inline)) {
              ids.push(inline.getFootnoteId());
            }
          }
        }
      }
      return ids;
    });
  }

  beforeEach(() => {
    editor = buildEditor('copy-root');
    seed(editor);
  });

  afterEach(() => {
    editor.dispose();
  });

  describe('copy: text/html', () => {
    it('appends the referenced note, and only that one', () => {
      const html = copyFirstParagraph(editor, 'text/html')!;
      const dom = new DOMParser().parseFromString(html, 'text/html');
      const section = dom.querySelector('[data-footnotes]')!;
      expect(section).not.toBeNull();
      expect(section.querySelector('li[id="fn-a"]')!.textContent).toContain(
        'note A',
      );
      expect(section.querySelector('li[id="fn-b"]')).toBeNull();
      expect(html).not.toContain('note B');
    });

    it('leaves a payload that already holds the section alone', () => {
      const html = copyAll(editor, 'text/html')!;
      expect(html.match(/data-footnotes/g)).toHaveLength(1);
      // the full section came from exportDOM and holds both notes
      expect(html).toContain('note A');
      expect(html).toContain('note B');
    });

    it('does not touch a selection referencing nothing', () => {
      editor.update(
        () => {
          const plain = $createParagraphNode().append($createTextNode('plain'));
          $getRoot().getFirstChild()!.insertBefore(plain);
        },
        {discrete: true},
      );
      const html = copyFirstParagraph(editor, 'text/html')!;
      expect(html).not.toContain('data-footnotes');
    });

    it('carries notes cited only from inside a carried note', () => {
      editor.update(
        () => {
          $getFootnoteDefinition('a')!
            .getFirstChild<ParagraphNode>()!
            .append($createTextNode(' cites'), $createFootnoteRefNode('c'));
        },
        {discrete: true},
      );
      editor.update(
        () => {
          $getFootnoteDefinition('c')!
            .getFirstChild<ParagraphNode>()!
            .append($createTextNode('note C'));
        },
        {discrete: true},
      );
      const html = copyFirstParagraph(editor, 'text/html')!;
      expect(html).toContain('note A');
      expect(html).toContain('note C');
      expect(html).not.toContain('note B');
    });
  });

  describe('copy: application/x-lexical-editor', () => {
    it('appends the referenced definition subtree', () => {
      const payload = copyFirstParagraph(
        editor,
        'application/x-lexical-editor',
      )!;
      const {nodes} = JSON.parse(payload) as {nodes: SerializedLexicalNode[]};
      const defs = nodes.filter(node => node.type === 'footnote-def');
      expect(defs).toHaveLength(1);
      expect(JSON.stringify(defs[0])).toContain('note A');
      expect(JSON.stringify(nodes)).not.toContain('note B');
    });

    it('leaves a select-all payload alone — the section carries its slots', () => {
      const payload = copyAll(editor, 'application/x-lexical-editor')!;
      const {nodes} = JSON.parse(payload) as {nodes: SerializedLexicalNode[]};
      expect(nodes.filter(node => node.type === 'footnote-def')).toHaveLength(
        0,
      );
      const section = nodes.find(node => node.type === 'footnote-section')!;
      expect(section).toBeDefined();
      expect(JSON.stringify(section)).toContain('note A');
      expect(JSON.stringify(section)).toContain('note B');
    });
  });

  describe('paste', () => {
    it('reconnects the carried note in a document that lacks it', () => {
      const payload = copyFirstParagraph(
        editor,
        'application/x-lexical-editor',
      )!;
      const other = buildEditor('paste-root');
      pasteJSON(other, payload);

      const refIds = readRefIds(other);
      expect(refIds).toEqual(['a']);
      other.read(() => {
        expect($getFootnoteDefinition('a')!.getTextContent()).toContain(
          'note A',
        );
      });
      other.dispose();
    });

    it('keeps the id when the target holds the same note (cut/paste, multi-ref)', () => {
      const payload = copyFirstParagraph(
        editor,
        'application/x-lexical-editor',
      )!;
      pasteJSON(editor, payload);

      expect(readRefIds(editor)).toEqual(['a', 'b', 'a']);
      editor.read(() => {
        // still one note per id — nothing duplicated
        expect(
          $getFootnoteDefinitions().map(def => def.getFootnoteId()),
        ).toEqual(['a', 'b']);
      });
    });

    it('re-keys a carried note whose id names a different note here', () => {
      const payload = copyFirstParagraph(
        editor,
        'application/x-lexical-editor',
      )!;
      const other = buildEditor('collide-root');
      other.update(
        () => {
          const p = $createParagraphNode().append(
            $createTextNode('local '),
            $createFootnoteRefNode('a'),
          );
          $getRoot().clear().append(p);
        },
        {discrete: true},
      );
      other.update(
        () => {
          $getFootnoteDefinition('a')!
            .getFirstChild<ParagraphNode>()!
            .append($createTextNode('a different local note'));
        },
        {discrete: true},
      );
      pasteJSON(other, payload);

      const refIds = readRefIds(other);
      expect(refIds).toHaveLength(2);
      const pastedId = refIds.find(id => id !== 'a')!;
      expect(pastedId).toBeDefined();
      other.read(() => {
        // the local note survived, the carried one landed under a fresh id
        expect($getFootnoteDefinition('a')!.getTextContent()).toContain(
          'a different local note',
        );
        expect($getFootnoteDefinition(pastedId)!.getTextContent()).toContain(
          'note A',
        );
      });
      other.dispose();
    });
  });

  describe('paste: text/html route', () => {
    it('re-keys through the HTML import route too', () => {
      const html = copyFirstParagraph(editor, 'text/html')!;
      const other = buildEditor('html-collide-root');
      other.update(
        () => {
          const p = $createParagraphNode().append(
            $createTextNode('local '),
            $createFootnoteRefNode('a'),
          );
          $getRoot().clear().append(p);
        },
        {discrete: true},
      );
      other.update(
        () => {
          $getFootnoteDefinition('a')!
            .getFirstChild<ParagraphNode>()!
            .append($createTextNode('a different local note'));
        },
        {discrete: true},
      );
      const {$insertDataTransfer} = getExtensionDependencyFromEditor(
        other,
        ClipboardImportExtension,
      ).output;
      const dataTransfer = {
        getData: (type: string) => (type === 'text/html' ? html : ''),
        types: ['text/html'],
      } as unknown as DataTransfer;
      other.update(
        () => {
          $getRoot().getFirstChild<ParagraphNode>()!.selectEnd();
          const selection = $getSelection();
          if ($isRangeSelection(selection)) {
            $insertDataTransfer(dataTransfer, selection);
          }
        },
        {discrete: true},
      );

      const refIds = readRefIds(other);
      expect(refIds).toHaveLength(2);
      const pastedId = refIds.find(id => id !== 'a')!;
      other.read(() => {
        expect($getFootnoteDefinition('a')!.getTextContent()).toContain(
          'a different local note',
        );
        expect($getFootnoteDefinition(pastedId)!.getTextContent()).toContain(
          'note A',
        );
      });
      other.dispose();
    });
  });

  describe('$generateDOMFromRoot', () => {
    it('exports the section on the root-inclusive path too', () => {
      const html = editor.read(
        () => $generateDOMFromRoot(document.createElement('div')).innerHTML,
      );
      expect(html).toContain('body ');
      expect(html).toContain('data-footnotes');
      expect(html).toContain('note A');
      expect(html).toContain('note B');
    });
  });
});
