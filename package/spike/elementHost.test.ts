/**
 * Can a plain ElementNode whose createDOM() returns a contentEditable="false"
 * shell act as a named-slot host, the way a DecoratorNode does?
 *
 * This is what the footnote section is, so the answer decides whether the notes
 * are editable islands — mountable anywhere — or merely inert content.
 *
 * The reconciler decides slot-container editability in $applySlotEditable
 * (LexicalReconciler.ts ~489):
 *
 *   if (decoratorHost || hostDom.contentEditable === 'false') {
 *     $markSlotEditable(container, activeEditor);   // contentEditable=true + __lexicalEditor
 *   } else {
 *     container.removeAttribute('contenteditable');
 *   }
 *
 * Everything hinges on the second half of that condition firing for an
 * ElementNode host. It all runs against a real editor with a root element
 * attached to document.body (slot containers only reconcile with a root
 * element).
 *
 * Environment: happy-dom. It stores contentEditable faithfully but has no
 * layout, no hit-testing and no native caret/beforeinput, so the browser-side
 * half of "selection containment" is out of reach here; the check-3 suite says
 * explicitly which assertions are model-level and which need a real browser.
 */
import {buildEditorFromExtensions} from '@lexical/extension';
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $getSlot,
  $getSlotFrame,
  $getSlotHost,
  $getSlotNames,
  $isRangeSelection,
  $isSlotChild,
  $isSlotHost,
  $setSlot,
  type EditorConfig,
  ElementNode,
  INTERNAL_$isBlock,
  type LexicalEditor,
  type LexicalNode,
} from 'lexical';
import {afterEach, describe, expect, it} from 'vitest';

// ---------------------------------------------------------------------------
// Nodes
// ---------------------------------------------------------------------------

/**
 * The footnotes-section shell — a plain ElementNode rendered
 * contentEditable=false. All content lives in slots, so it has zero children.
 */
class ShellHostNode extends ElementNode {
  $config() {
    return this.config('spike_shell_host', {
      extends: ElementNode,
      slots: ['fn:a', 'fn:b'],
    });
  }
  createDOM(_config: EditorConfig, _editor: LexicalEditor): HTMLElement {
    const dom = document.createElement('section');
    dom.contentEditable = 'false';
    return dom;
  }
  updateDOM(): boolean {
    return false;
  }
  canBeEmpty(): boolean {
    return true;
  }
}

/**
 * Same shell, but canBeEmpty() === false. Kept as a first-class variant rather
 * than an afterthought: check 2 shows the two differ in whether the empty shell
 * is a caret target, which is the whole selection-containment question.
 */
class StrictShellHostNode extends ElementNode {
  $config() {
    return this.config('spike_strict_shell_host', {
      extends: ElementNode,
      slots: ['fn:a', 'fn:b'],
    });
  }
  createDOM(): HTMLElement {
    const dom = document.createElement('section');
    dom.contentEditable = 'false';
    return dom;
  }
  updateDOM(): boolean {
    return false;
  }
  canBeEmpty(): boolean {
    return false;
  }
}

/** Control: an ordinary editable element host (no contentEditable=false). */
class PlainHostNode extends ElementNode {
  $config() {
    return this.config('spike_plain_host', {
      extends: ElementNode,
      slots: ['fn:a'],
    });
  }
  createDOM(): HTMLElement {
    return document.createElement('section');
  }
  updateDOM(): boolean {
    return false;
  }
  canBeEmpty(): boolean {
    return true;
  }
}

/** A footnote-definition stand-in: a non-inline block, a legal slot value. */
class DefNode extends ElementNode {
  $config() {
    return this.config('spike_def', {extends: ElementNode});
  }
  createDOM(): HTMLElement {
    const dom = document.createElement('div');
    dom.setAttribute('data-spike-def', 'true');
    return dom;
  }
  updateDOM(): boolean {
    return false;
  }
}

function $createDef(text: string): DefNode {
  const def = new DefNode();
  def.append($createParagraphNode().append($createTextNode(text)));
  return def;
}

// ---------------------------------------------------------------------------
// Harness: an editor whose root element is attached to the document.
// ---------------------------------------------------------------------------

type Editor = ReturnType<typeof buildEditorFromExtensions>;
const openEditors: Array<{editor: Editor; root: HTMLElement}> = [];

function makeEditor(): Editor {
  const editor = buildEditorFromExtensions({
    name: 'spike-element-host',
    namespace: 'spike',
    nodes: [ShellHostNode, StrictShellHostNode, PlainHostNode, DefNode],
    onError: (error: Error) => {
      throw error;
    },
  });
  const root = document.createElement('div');
  document.body.appendChild(root);
  editor.setRootElement(root);
  openEditors.push({editor, root});
  return editor;
}

afterEach(() => {
  for (const {editor, root} of openEditors.splice(0)) {
    editor.setRootElement(null);
    editor.dispose();
    root.remove();
  }
});

/**
 * Install `host` as the *only* thing in the document. buildEditorFromExtensions
 * seeds root with an empty paragraph; leaving it in place would make
 * $getRoot().getFirstChild() the paragraph, not the host.
 */
function mountHost<T extends ElementNode>(
  editor: Editor,
  $createHost: () => T,
  slots: Record<string, string>,
): {hostKey: string; slotKeys: Record<string, string>} {
  let hostKey = '';
  const slotKeys: Record<string, string> = {};
  editor.update(
    () => {
      const root = $getRoot();
      root.clear();
      const host = $createHost();
      root.append(host);
      for (const [name, text] of Object.entries(slots)) {
        const def = $createDef(text);
        $setSlot(host, name, def);
        slotKeys[name] = def.getKey();
      }
      hostKey = host.getKey();
    },
    {discrete: true},
  );
  return {hostKey, slotKeys};
}

/**
 * The slot container as the DOM actually holds it. $getSlotContainer is
 * @internal (not exported from the `lexical` entrypoint), so resolve it the way
 * the reconciler defines it: the slot value's DOM parent, which carries
 * [data-lexical-slot="<name>"].
 */
function slotContainerOf(
  editor: Editor,
  hostKey: string,
  name: string,
): (HTMLElement & {__lexicalEditor?: LexicalEditor}) | null {
  return editor.read(() => {
    const host = editor.getEditorState()._nodeMap.get(hostKey);
    const value = host === undefined ? null : $getSlot(host, name);
    const valueDom =
      value === null ? null : editor.getElementByKey(value.getKey());
    return valueDom === null ? null : valueDom.parentElement;
  });
}

// ---------------------------------------------------------------------------
// Precondition: does happy-dom implement the property the reconciler branches
// on? If HTMLElement#contentEditable were not a real property here, the
// branch could never fire for reasons that have nothing to do with Lexical, and
// every result below would be an artifact of the test environment.
// ---------------------------------------------------------------------------

describe('precondition: happy-dom contentEditable', () => {
  it('reflects contentEditable="false" as the string the reconciler compares against', () => {
    const el = document.createElement('section');
    el.contentEditable = 'false';
    expect(el.contentEditable).toBe('false');
    expect(el.getAttribute('contenteditable')).toBe('false');
  });

  it('KNOWN GAP: happy-dom querySelectorAll does not implement :scope', () => {
    // Recorded because it silently returns [] rather than throwing, which reads
    // as "no slot containers were rendered" if you are not expecting it.
    const parent = document.createElement('div');
    parent.appendChild(document.createElement('span'));
    expect(parent.querySelectorAll(':scope > span')).toHaveLength(0); // a real browser: 1
    expect(parent.children).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Check 1 (decisive): slot-container editability per host kind.
// ---------------------------------------------------------------------------

describe('check 1: slot container editability (the whole question)', () => {
  it('contentEditable=false ElementNode host: container IS marked editable and carries __lexicalEditor', () => {
    const editor = makeEditor();
    const {hostKey} = mountHost(editor, () => new ShellHostNode(), {
      'fn:a': 'definition a',
    });

    const hostDom = editor.getElementByKey(hostKey)!;
    expect(hostDom.tagName).toBe('SECTION');
    expect(hostDom.contentEditable).toBe('false');

    const container = slotContainerOf(editor, hostKey, 'fn:a')!;
    expect(container.getAttribute('data-lexical-slot')).toBe('fn:a');

    // The decisive pair: the reconciler took the
    // `hostDom.contentEditable === 'false'` branch of $applySlotEditable, so a
    // plain ElementNode shell gets the same editable island a decorator would.
    expect(container.contentEditable).toBe('true');
    expect(container.__lexicalEditor).toBe(editor);

    // ...and the slot subtree really rendered inside that container.
    expect(container.querySelector('[data-spike-def]')).not.toBeNull();
    expect(container.textContent).toBe('definition a');
  });

  it('plain (editable) ElementNode host: container gets NO contentEditable', () => {
    const editor = makeEditor();
    const {hostKey} = mountHost(editor, () => new PlainHostNode(), {
      'fn:a': 'definition a',
    });

    const hostDom = editor.getElementByKey(hostKey)!;
    expect(hostDom.contentEditable).not.toBe('false'); // nothing set it

    const container = slotContainerOf(editor, hostKey, 'fn:a')!;
    expect(container.hasAttribute('contenteditable')).toBe(false);
    expect(container.__lexicalEditor).toBeUndefined();
  });

  it('every slot on the shell is marked independently, in declared order', () => {
    const editor = makeEditor();
    // Insert b before a: declared order ['fn:a','fn:b'] must win.
    const {hostKey} = mountHost(editor, () => new ShellHostNode(), {
      'fn:b': 'definition b',
      'fn:a': 'definition a',
    });

    editor.read(() => {
      const host = $getRoot().getFirstChildOrThrow();
      expect($isSlotHost(host)).toBe(true);
      expect($getSlotNames(host)).toEqual(['fn:a', 'fn:b']);
    });

    for (const name of ['fn:a', 'fn:b']) {
      const container = slotContainerOf(editor, hostKey, name)!;
      expect(container.contentEditable).toBe('true');
      expect(container.__lexicalEditor).toBe(editor);
    }

    // Containers sit slots-first inside the host DOM, in slot-map order.
    // (Walk children directly: happy-dom's querySelectorAll does not implement
    // the `:scope` pseudo-class and silently returns [] for ':scope > *'.)
    const hostDom = editor.getElementByKey(hostKey)!;
    expect(
      Array.from(hostDom.children).map(el =>
        el.getAttribute('data-lexical-slot'),
      ),
    ).toEqual(['fn:a', 'fn:b']);
  });

  it('setEditable(false) propagates into the shell container (after its commit lands)', () => {
    const editor = makeEditor();
    const {hostKey} = mountHost(editor, () => new ShellHostNode(), {
      'fn:a': 'definition a',
    });
    const container = slotContainerOf(editor, hostKey, 'fn:a')!;
    expect(container.contentEditable).toBe('true');

    // setEditable schedules a NON-discrete `update(() => $fullReconcile())`
    // (LexicalEditor.ts ~1932), which commits on a microtask. A discrete no-op
    // update flushes it; without this the DOM still reads 'true' synchronously.
    editor.setEditable(false);
    editor.update(() => {}, {discrete: true});

    expect(container.contentEditable).toBe('false');
    expect(container.__lexicalEditor).toBeUndefined();

    editor.setEditable(true);
    editor.update(() => {}, {discrete: true});
    expect(container.contentEditable).toBe('true');
    expect(container.__lexicalEditor).toBe(editor);
  });
});

// ---------------------------------------------------------------------------
// Check 2: can the shell host live with zero children (all content in slots)?
// ---------------------------------------------------------------------------

describe('check 2: zero-children host viability', () => {
  it('canBeEmpty()=true: childless host survives commits and is not garbage collected', () => {
    const editor = makeEditor();
    const {hostKey, slotKeys} = mountHost(editor, () => new ShellHostNode(), {
      'fn:a': 'definition a',
    });
    const defKey = slotKeys['fn:a']!;

    editor.read(() => {
      const host = $getRoot().getFirstChildOrThrow<ShellHostNode>();
      expect(host.getKey()).toBe(hostKey);
      expect(host.getChildrenSize()).toBe(0);
      expect(host.isAttached()).toBe(true);
      // isEmpty() is slot-aware:
      //   getChildrenSize() === 0 && $getSlotNames(this).length === 0
      // (LexicalElementNode.ts:268). A childless host that holds content in its
      // slots reports NOT empty — deliberately, per the comment there: otherwise
      // $removeNode would cascade-prune it once its last child is gone and orphan
      // the slot subtrees. This is the mechanism that keeps a zero-children shell
      // alive, so it is the load-bearing assertion of this check.
      expect(host.isEmpty()).toBe(false);

      // The slot value is attached through the slot up-link, not __parent.
      const def = $getSlot(host, 'fn:a')!;
      expect(def.getKey()).toBe(defKey);
      expect(def.isAttached()).toBe(true);
      expect(def.getParent()).toBeNull();
      expect($getSlotHost(def)!.getKey()).toBe(hostKey);
    });

    // Survives a later unrelated commit (GC runs per update).
    editor.update(
      () => {
        $getRoot().append($createParagraphNode().append($createTextNode('x')));
      },
      {discrete: true},
    );
    editor.read(() => {
      expect($getRoot().getFirstChildOrThrow().getKey()).toBe(hostKey);
      const nodeMap = editor.getEditorState()._nodeMap;
      expect(nodeMap.has(hostKey)).toBe(true);
      expect(nodeMap.has(defKey)).toBe(true);
    });
    expect(editor.getElementByKey(hostKey)).not.toBeNull();
  });

  it('canBeEmpty()=false: the childless host ALSO survives (self-removal only fires on splice)', () => {
    // ElementNode.splice does `if (newSize === 0 && !this.canBeEmpty()) this.remove()`
    // (LexicalElementNode.ts:800). A host that never had children is never
    // spliced, so canBeEmpty()=false does not cost us the host — meaning the
    // flag is free to choose on other grounds (see the caret-target test below).
    const editor = makeEditor();
    const {hostKey} = mountHost(editor, () => new StrictShellHostNode(), {
      'fn:a': 'definition a',
    });

    editor.update(
      () => {
        $getRoot().append($createParagraphNode().append($createTextNode('x')));
      },
      {discrete: true},
    );
    editor.read(() => {
      const host = $getRoot().getFirstChildOrThrow<ShellHostNode>();
      expect(host.getKey()).toBe(hostKey);
      expect(host.getChildrenSize()).toBe(0);
      expect(host.isAttached()).toBe(true);
    });
    expect(slotContainerOf(editor, hostKey, 'fn:a')!.contentEditable).toBe(
      'true',
    );
  });

  it('no placeholder <br> is injected into the empty host, under either flag', () => {
    // The reconciler's managed line break keys off "last child is a linebreak or
    // decorator" ($isLastChildLineBreakOrDecorator), not off emptiness — so an
    // empty element gets no <br> regardless of canBeEmpty(). The host DOM holds
    // exactly its slot containers.
    const editor = makeEditor();
    const {hostKey} = mountHost(editor, () => new ShellHostNode(), {
      'fn:a': 'definition a',
    });
    const strict = mountHost(makeEditor(), () => new StrictShellHostNode(), {
      'fn:a': 'definition a',
    });
    const strictEditor = openEditors[openEditors.length - 1]!.editor;

    const childTags = (dom: HTMLElement) =>
      Array.from(dom.children).map(el => el.tagName);

    const hostDom = editor.getElementByKey(hostKey)!;
    expect(childTags(hostDom)).toEqual(['DIV']); // the slot container, nothing else
    expect(hostDom.firstElementChild!.getAttribute('data-lexical-slot')).toBe(
      'fn:a',
    );

    const strictDom = strictEditor.getElementByKey(strict.hostKey)!;
    expect(childTags(strictDom)).toEqual(['DIV']);
  });
});

// ---------------------------------------------------------------------------
// Check 3: selection containment.
//
// happy-dom CAN answer: the Lexical model side (does the slot boundary behave
// like a shadow root; is the empty shell itself a caret target in the model) and
// the DOM contract a browser's caret logic keys off (host contentEditable=false,
// container contentEditable=true).
//
// happy-dom CANNOT answer: no layout, no hit-testing, no native caret or
// beforeinput. Whether a *click* on the shell chrome refuses the caret, and
// whether typing/arrowing at a slot edge escapes the island, are browser
// behaviors this environment cannot express. Those need a real browser (e2e).
// ---------------------------------------------------------------------------

describe('check 3: selection containment', () => {
  it('DOM contract: shell is the non-editable host, the slot container is the editable island', () => {
    const editor = makeEditor();
    const {hostKey} = mountHost(editor, () => new ShellHostNode(), {
      'fn:a': 'definition a',
    });

    const hostDom = editor.getElementByKey(hostKey)!;
    const container = slotContainerOf(editor, hostKey, 'fn:a')!;

    // This pair is exactly what a browser uses to pick caret targets: an editing
    // host boundary at the shell, a nested editing host at the container.
    // happy-dom stores it faithfully but does not act on it.
    expect(hostDom.contentEditable).toBe('false');
    expect(container.contentEditable).toBe('true');
    expect(container.parentElement).toBe(hostDom);
    // Reconciler parks containers hidden; the host reveals them by mounting
    // (mountSlotContainer / $getSlotTargetElement). Unmounted => display:none.
    expect(container.style.display).toBe('none');
  });

  it('model: a selection inside a slotted node is scoped to the slot subtree (shadow-root boundary)', () => {
    const editor = makeEditor();
    const {hostKey, slotKeys} = mountHost(editor, () => new ShellHostNode(), {
      'fn:a': 'definition a',
    });

    editor.update(
      () => {
        const host = $getRoot().getFirstChildOrThrow();
        const def = $getSlot(host, 'fn:a')!;
        expect($isSlotChild(def)).toBe(true);
        (def as DefNode).selectStart();
      },
      {discrete: true},
    );

    editor.read(() => {
      const selection = $getSelection();
      expect($isRangeSelection(selection)).toBe(true);
      const anchorNode: LexicalNode = (
        selection as ReturnType<typeof $getSelection> & {
          anchor: {getNode: () => LexicalNode};
        }
      ).anchor.getNode();
      expect(anchorNode.getTextContent()).toBe('definition a');

      // Walking up from the anchor stops at the slot value: the slot link is the
      // shadow root of this selection, so it never reaches the shell.
      const frame = $getSlotFrame(anchorNode)!;
      expect(frame.getKey()).toBe(slotKeys['fn:a']);
      expect(frame.getKey()).not.toBe(hostKey);
      expect(frame.getParent()).toBeNull();
      expect($getSlotHost(frame)!.getKey()).toBe(hostKey);
    });
  });

  it('HAZARD: canBeEmpty()=true makes the empty shell itself a block, i.e. a model caret target', () => {
    // INTERNAL_$isBlock (LexicalUtils.ts:2642) is
    //   !isInline() && canBeEmpty() !== false && (no children || inline first child)
    // A childless shell with canBeEmpty()=true satisfies all three, so selection
    // normalization is willing to put a caret *in the shell* — even though its
    // DOM is contentEditable=false. Text inserted there would become a child of
    // the non-editable shell, outside every slot island.
    const editor = makeEditor();
    const {hostKey} = mountHost(editor, () => new ShellHostNode(), {
      'fn:a': 'definition a',
    });

    editor.read(() => {
      const host = $getRoot().getFirstChildOrThrow();
      expect(host.getKey()).toBe(hostKey);
      expect(INTERNAL_$isBlock(host)).toBe(true); // <- the hazard
    });

    // And the model happily lands a caret on it and accepts text into the shell.
    editor.update(
      () => {
        $getRoot().getFirstChildOrThrow<ShellHostNode>().selectEnd();
        const selection = $getSelection();
        expect($isRangeSelection(selection)).toBe(true);
        expect(selection!.getNodes()[0]!.getKey()).toBe(hostKey);
        selection!.insertText('leaked');
      },
      {discrete: true},
    );
    editor.read(() => {
      const host = $getRoot().getFirstChildOrThrow<ShellHostNode>();
      // Text landed in the shell's children channel, not in any slot.
      expect(host.getChildrenSize()).toBe(1);
      expect(host.getFirstChildOrThrow().getTextContent()).toBe('leaked');
    });
  });

  it('canBeEmpty()=false closes that hazard: the empty shell is NOT a block', () => {
    const editor = makeEditor();
    const {hostKey} = mountHost(editor, () => new StrictShellHostNode(), {
      'fn:a': 'definition a',
    });

    editor.read(() => {
      const host = $getRoot().getFirstChildOrThrow<ShellHostNode>();
      expect(host.getKey()).toBe(hostKey);
      expect(host.getChildrenSize()).toBe(0);
      expect(INTERNAL_$isBlock(host)).toBe(false);
      // The only text in the section is behind the slot boundary, folded
      // slots-first by getTextContent.
      expect(host.getTextContent()).toBe('definition a');
    });
  });
});
