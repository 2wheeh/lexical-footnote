import {buildEditorFromExtensions} from '@lexical/extension';
import {$generateHtmlFromNodes} from '@lexical/html';
import {RichTextExtension} from '@lexical/rich-text';
import {
  $create,
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSlot,
  $setSlot,
  defineExtension,
  ElementNode,
  type EditorConfig,
} from 'lexical';
import {describe, expect, it} from 'vitest';

/**
 * Spike C — what breaks when document content is hosted in a slot on the ROOT.
 *
 * This is the shape the maintainer sketched and this project rejected. The
 * reasons are measured here rather than remembered, with plain nodes and none
 * of the footnote extension's own transforms in the way.
 */
class SectionNode extends ElementNode {
  $config() {
    return this.config('spike-root-section', {extends: ElementNode});
  }

  createDOM(_config: EditorConfig): HTMLElement {
    return document.createElement('section');
  }

  updateDOM(): boolean {
    return false;
  }
}

const SpikeExtension = defineExtension({
  name: 'spike/rootSlot',
  nodes: () => [SectionNode],
});

function build() {
  return buildEditorFromExtensions({
    dependencies: [RichTextExtension, SpikeExtension],
    name: 'spike',
    namespace: 'spike',
  });
}

/** `body` in the children spine; `note` hosted in a slot on the root. */
function seed(editor: ReturnType<typeof build>) {
  editor.update(
    () => {
      const root = $getRoot();
      root
        .clear()
        .append($createParagraphNode().append($createTextNode('body')));
      const section = $create(SectionNode);
      section.append(
        $createParagraphNode().append($createTextNode('slotted note')),
      );
      $setSlot(root, 'footnotes', section);
    },
    {discrete: true},
  );
}

describe('a slot on the RootNode', () => {
  it('is accepted, and holds its content in the model', () => {
    const editor = build();
    seed(editor);
    editor.read(() => {
      expect($getSlot($getRoot(), 'footnotes')?.getTextContent()).toBe(
        'slotted note',
      );
      // getTextContent folds slots FIRST — so a root-hosted footnotes section
      // reads *above* the body in plain text, which is backwards.
      expect($getRoot().getTextContent()).toBe('slotted notebody');
    });
    editor.dispose();
  });

  it('DOES NOT reach the HTML exporter', () => {
    const editor = build();
    seed(editor);
    const html = editor.read(() => $generateHtmlFromNodes(editor));

    expect(html).toContain('body');
    // $generateDOMFromNodes walks root.getChildren(); a slot is not a child.
    expect(html).not.toContain('slotted note');
    editor.dispose();
  });

  it('DOES survive a JSON round-trip', () => {
    const editor = build();
    seed(editor);
    const json = JSON.stringify(editor.getEditorState().toJSON());

    const next = build();
    next.setEditorState(next.parseEditorState(json));
    const restored = next.read(
      () => $getSlot($getRoot(), 'footnotes')?.getTextContent() ?? null,
    );

    expect(restored).toBe('slotted note');
    editor.dispose();
    next.dispose();
  });
});
