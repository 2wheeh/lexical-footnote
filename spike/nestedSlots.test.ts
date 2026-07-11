/**
 * Nested named slots: a slot host that is itself a slot value.
 *
 * Shape under test — note that this is the shape the project REJECTED (the
 * section hosted in a slot on the root, which no exporter reaches; see
 * rootSlot.test.ts). Kept because the mechanics it pins down — slots nesting,
 * GC, JSON round-trip — are the ones the shipped model relies on.
 *   RootNode
 *    └─ slot "footnotes" → SpikeSectionNode        (a slot HOST itself)
 *                           ├─ slot "fn:a" → SpikeDefNode (ElementNode + paragraph children)
 *                           └─ slot "fn:b" → SpikeDefNode
 */
import {buildEditorFromExtensions} from '@lexical/extension';
import {$dfs, $dfsWithSlots} from '@lexical/utils';
import {
  $create,
  $createParagraphNode,
  $createTextNode,
  $getNodeByKey,
  $getRoot,
  $getSlot,
  $getSlotHost,
  $getSlotNames,
  $nodesOfType,
  $removeSlot,
  $setSlot,
  createEditor,
  ElementNode,
  type EditorConfig,
  type LexicalEditor,
  type LexicalNode,
} from 'lexical';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';

class SpikeSectionNode extends ElementNode {
  $config() {
    return this.config('spike-section', {extends: ElementNode});
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const ol = document.createElement('ol');
    ol.setAttribute('data-spike-section', 'true');
    return ol;
  }

  updateDOM(): boolean {
    return false;
  }
}

class SpikeDefNode extends ElementNode {
  $config() {
    return this.config('spike-def', {extends: ElementNode});
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const li = document.createElement('li');
    li.setAttribute('data-spike-def', 'true');
    return li;
  }

  updateDOM(): boolean {
    return false;
  }
}

function $createDef(text: string): SpikeDefNode {
  const def = $create(SpikeDefNode);
  const p = $createParagraphNode();
  p.append($createTextNode(text));
  def.append(p);
  return def;
}

const NODES = [SpikeSectionNode, SpikeDefNode];

function buildEditor() {
  const editor = buildEditorFromExtensions({
    name: 'spike-nested-slots',
    namespace: 'spike',
    nodes: NODES,
  });
  const root = document.createElement('div');
  root.contentEditable = 'true';
  document.body.appendChild(root);
  editor.setRootElement(root);
  return {editor, rootElement: root};
}

/** Builds root → section → {fn:a, fn:b} and returns the keys. */
function $buildNested() {
  const section = $create(SpikeSectionNode);
  const defA = $createDef('note a');
  const defB = $createDef('note b');
  $setSlot(section, 'fn:a', defA);
  $setSlot(section, 'fn:b', defB);
  $setSlot($getRoot(), 'footnotes', section);
  return {
    defAKey: defA.getKey(),
    defBKey: defB.getKey(),
    sectionKey: section.getKey(),
  };
}

describe('spike B: nested named slots', () => {
  let editor: ReturnType<typeof buildEditor>['editor'];
  let rootElement: HTMLElement;

  beforeEach(() => {
    const built = buildEditor();
    editor = built.editor;
    rootElement = built.rootElement;
  });

  afterEach(() => {
    editor.dispose();
    rootElement.remove();
  });

  it('1. accepts an undeclared slot on RootNode without subclassing RootNode', () => {
    editor.update(
      () => {
        const root = $getRoot();
        const p = $createParagraphNode();
        p.append($createTextNode('body'));
        root.append(p);
        $buildNested();
      },
      {discrete: true},
    );

    editor.read(() => {
      const root = $getRoot();
      // RootNode declares no `slots` in its $config, yet the undeclared name sticks.
      expect($getSlotNames(root)).toContain('footnotes');
      const section = $getSlot(root, 'footnotes');
      expect(section).toBeInstanceOf(SpikeSectionNode);
      // The slot channel is disjoint from the children channel: the section is
      // not a root child, and root's children are untouched paragraphs.
      expect(root.getChildren()).not.toContain(section);
      expect(root.getChildren().every((c) => c.getType() === 'paragraph')).toBe(
        true,
      );
      expect(section!.getParent()).toBe(null);
      expect($getSlotHost(section!)).toBe(root);
    });
  });

  it('2. nests: the section (a slot value) is itself a slot host', () => {
    let keys: ReturnType<typeof $buildNested>;
    editor.update(
      () => {
        keys = $buildNested();
      },
      {discrete: true},
    );

    editor.read(() => {
      const root = $getRoot();
      const section = $getSlot(root, 'footnotes') as SpikeSectionNode;
      expect(section.getKey()).toBe(keys.sectionKey);
      expect($getSlotNames(section)).toEqual(['fn:a', 'fn:b']);

      const defA = $getSlot(section, 'fn:a');
      const defB = $getSlot(section, 'fn:b');
      expect(defA).toBeInstanceOf(SpikeDefNode);
      expect(defA!.getKey()).toBe(keys.defAKey);
      expect($getSlotHost(defA!)).toBe(section);
      expect($getSlotHost(defB!)).toBe(section);
      // Definitions keep ordinary element children.
      expect(defA!.getTextContent()).toBe('note a');
      // Two levels of slot up-links, no parent links anywhere on the slot spine.
      expect(defA!.getParent()).toBe(null);
      expect(defA!.isAttached()).toBe(true);
    });
  });

  it('3. round-trips a 2-level slot tree through JSON', () => {
    editor.update(
      () => {
        const p = $createParagraphNode();
        p.append($createTextNode('body'));
        $getRoot().append(p);
        $buildNested();
      },
      {discrete: true},
    );

    interface SerializedWithSlots {
      type: string;
      $slots?: Record<string, SerializedWithSlots>;
    }

    const json = editor.getEditorState().toJSON();
    const rootJson = json.root as unknown as SerializedWithSlots;

    if (process.env.SPIKE_DUMP) {
      console.log(JSON.stringify(json, null, 2));
    }
    // Nested `$slots` really are emitted, keyed by slot name, on both levels.
    const rootSlots = rootJson.$slots;
    expect(rootSlots).toBeDefined();
    const sectionJson = rootSlots!.footnotes;
    expect(sectionJson).toBeDefined();
    expect(sectionJson!.type).toBe('spike-section');
    const sectionSlots = sectionJson!.$slots;
    expect(sectionSlots).toBeDefined();
    expect(Object.keys(sectionSlots!)).toEqual(['fn:a', 'fn:b']);
    expect(sectionSlots!['fn:a']!.type).toBe('spike-def');

    // Fresh editor, fresh node registry: parse + setEditorState.
    const editor2: LexicalEditor = createEditor({
      namespace: 'spike',
      nodes: NODES,
      onError: (e) => {
        throw e;
      },
    });
    const el2 = document.createElement('div');
    document.body.appendChild(el2);
    editor2.setRootElement(el2);

    editor2.setEditorState(
      editor2.parseEditorState(JSON.parse(JSON.stringify(json))),
    );

    editor2.read(() => {
      const root = $getRoot();
      expect($getSlotNames(root)).toEqual(['footnotes']);
      const section = $getSlot(root, 'footnotes')!;
      expect(section).toBeInstanceOf(SpikeSectionNode);
      expect($getSlotNames(section)).toEqual(['fn:a', 'fn:b']);

      const defA = $getSlot(section, 'fn:a')!;
      const defB = $getSlot(section, 'fn:b')!;
      expect(defA).toBeInstanceOf(SpikeDefNode);
      expect(defA.getTextContent()).toBe('note a');
      expect(defB.getTextContent()).toBe('note b');
      // Up-links are rebuilt by the importer, not just the down map.
      expect($getSlotHost(defA)).toBe(section);
      expect($getSlotHost(section)).toBe(root);
      expect(defA.isAttached()).toBe(true);
      // Ordinary children survive alongside the slot channel.
      expect(root.getChildren()).not.toContain(section);
      expect(
        root.getChildren().map((c) => c.getTextContent()),
      ).toContain('body');
      // Slot text folds into the host's getTextContent (slots-first).
      expect(root.getTextContent()).toContain('note a');
    });

    editor2.setRootElement(null);
    el2.remove();
  });

  it('4. traversal: $dfsWithSlots descends, $dfs does not, $nodesOfType sees slotted nodes', () => {
    editor.update(
      () => {
        const p = $createParagraphNode();
        p.append($createTextNode('body'));
        $getRoot().append(p);
        $buildNested();
      },
      {discrete: true},
    );

    editor.read(() => {
      const root = $getRoot();

      const withSlots = $dfsWithSlots(root).map((e) => e.node.getType());
      expect(withSlots).toContain('spike-section');
      expect(withSlots.filter((t) => t === 'spike-def')).toHaveLength(2);

      const plain = $dfs(root).map((e) => e.node.getType());
      expect(plain).not.toContain('spike-section');
      expect(plain).not.toContain('spike-def');

      // The replacement for $dfs in the extension: does the type index see slots?
      expect($nodesOfType(SpikeDefNode)).toHaveLength(2);
      expect(
        $nodesOfType(SpikeDefNode)
          .map((n) => n.getTextContent())
          .sort(),
      ).toEqual(['note a', 'note b']);
      expect($nodesOfType(SpikeSectionNode)).toHaveLength(1);
    });

    // $nodesOfType has a read-only cached path and a mutable path; exercise both.
    editor.update(
      () => {
        expect($nodesOfType(SpikeDefNode)).toHaveLength(2);
      },
      {discrete: true},
    );
  });

  it('5. GC: removing the root slot collects the whole nested subtree', () => {
    let keys: ReturnType<typeof $buildNested>;
    let paragraphKey = '';
    editor.update(
      () => {
        keys = $buildNested();
        const section = $getSlot($getRoot(), 'footnotes') as SpikeSectionNode;
        const defA = $getSlot(section, 'fn:a') as SpikeDefNode;
        paragraphKey = defA.getFirstChildOrThrow().getKey();
      },
      {discrete: true},
    );

    const before = editor.getEditorState()._nodeMap;
    expect(before.has(keys!.sectionKey)).toBe(true);
    expect(before.has(keys!.defAKey)).toBe(true);
    expect(before.has(paragraphKey)).toBe(true);

    editor.update(
      () => {
        $removeSlot($getRoot(), 'footnotes');
      },
      {discrete: true},
    );

    const after = editor.getEditorState()._nodeMap;
    // Host, both slotted defs, and the defs' own children are all collected.
    expect(after.has(keys!.sectionKey)).toBe(false);
    expect(after.has(keys!.defAKey)).toBe(false);
    expect(after.has(keys!.defBKey)).toBe(false);
    expect(after.has(paragraphKey)).toBe(false);

    editor.read(() => {
      expect($getSlotNames($getRoot())).toEqual([]);
      expect($getSlot($getRoot(), 'footnotes')).toBe(null);
      expect($getNodeByKey(keys!.defAKey)).toBe(null);
      expect($nodesOfType(SpikeDefNode)).toHaveLength(0);
    });
  });
});
