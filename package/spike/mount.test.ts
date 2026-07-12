/**
 * Mount freedom.
 *
 * Question: can a named-slot subtree be rendered (and stay editable) in a DOM
 * element that lives OUTSIDE the editor's root element (sidebar / popup)?
 *
 * 3x2 matrix:
 *   hosts   : DecoratorNode | ElementNode with contentEditable=false | plain ElementNode
 *   targets : element inside the editor root | element outside the editor root
 *
 * Real APIs used (lexical 0.47.0, node_modules/lexical/src):
 *   mountSlotContainer(editor, nodeKey, slotName, target): HTMLElement | null
 *   unmountSlotContainer(editor, nodeKey, container): void
 *
 * NOTE on "editable": happy-dom cannot simulate real typing/caret placement, so
 * we use the reconciler's own contract as the proxy — a slot container is an
 * editing host of this editor iff contentEditable === 'true' AND
 * container.__lexicalEditor === editor (that pair is exactly what
 * $markSlotEditable sets, and what lexical's event layer looks for when routing
 * beforeinput/selection back into the editor). Actual keystrokes are marked
 * NEEDS-BROWSER below.
 */
import {buildEditorFromExtensions, defineExtension} from '@lexical/extension';
import {
  $createParagraphNode,
  $createTextNode,
  $getNodeByKey,
  $getRoot,
  $isTextNode,
  $setSlot,
  DecoratorNode,
  ElementNode,
  type LexicalEditor,
  mountSlotContainer,
  unmountSlotContainer,
} from 'lexical';
import {afterEach, describe, expect, test} from 'vitest';

const SLOT = 'content';

// A container with no `contenteditable` attribute: happy-dom's getter reports
// the inherited value ('inherit'), a real browser reports ''. Either way it
// means "not explicitly marked", which is the fact this spike cares about.
const INHERITED_CE = 'inherit';

// setEditable re-renders slot islands through a normal (non-discrete) update,
// so its commit lands on a microtask; drain it before asserting.
const flush = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

/** (a) DecoratorNode host, non-inline. */
class DecoHostNode extends DecoratorNode<null> {
  $config() {
    return this.config('spike_deco_host', {
      extends: DecoratorNode,
      slots: [SLOT],
    });
  }
  createDOM(): HTMLElement {
    const dom = document.createElement('div');
    dom.setAttribute('data-host', 'decorator');
    return dom;
  }
  updateDOM(): false {
    return false;
  }
  decorate(): null {
    return null;
  }
  isInline(): boolean {
    return false;
  }
}

/** (b) ElementNode host whose createDOM sets contentEditable = 'false'. */
class CeFalseHostNode extends ElementNode {
  $config() {
    return this.config('spike_ce_false_host', {
      extends: ElementNode,
      slots: [SLOT],
    });
  }
  createDOM(): HTMLElement {
    const dom = document.createElement('div');
    dom.setAttribute('data-host', 'ce-false');
    dom.contentEditable = 'false';
    return dom;
  }
  updateDOM(): false {
    return false;
  }
}

/** (c) plain ElementNode host (inherits editability from the root). */
class PlainHostNode extends ElementNode {
  $config() {
    return this.config('spike_plain_host', {
      extends: ElementNode,
      slots: [SLOT],
    });
  }
  createDOM(): HTMLElement {
    const dom = document.createElement('div');
    dom.setAttribute('data-host', 'plain');
    return dom;
  }
  updateDOM(): false {
    return false;
  }
}

type HostKind = 'decorator' | 'ce-false' | 'plain';
type TargetKind = 'inside-root' | 'outside-root';

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) {
    cleanups.pop()!();
  }
});

interface Fixture {
  editor: LexicalEditor;
  rootElement: HTMLElement;
  hostKey: string;
  textKey: string;
  hostDom: HTMLElement;
  target: HTMLElement;
}

function setup(hostKind: HostKind, targetKind: TargetKind): Fixture {
  const editor = buildEditorFromExtensions(
    defineExtension({
      $initialEditorState: () => {
        $getRoot().clear();
      },
      name: '[spike-mount]',
      nodes: [DecoHostNode, CeFalseHostNode, PlainHostNode],
    }),
  );
  const rootElement = document.createElement('div');
  rootElement.contentEditable = 'true';
  document.body.appendChild(rootElement);
  editor.setRootElement(rootElement);

  // The "inside the editor root" target is a plain div appended to the root
  // element; the "outside" target is a sibling of the root on document.body
  // (the sidebar / popup case).
  const target = document.createElement('div');
  target.setAttribute('data-target', targetKind);
  if (targetKind === 'inside-root') {
    rootElement.appendChild(target);
  } else {
    document.body.appendChild(target);
  }

  cleanups.push(() => {
    editor.dispose();
    rootElement.remove();
    target.remove();
  });

  let hostKey = '';
  let textKey = '';
  editor.update(
    () => {
      const host =
        hostKind === 'decorator'
          ? new DecoHostNode()
          : hostKind === 'ce-false'
            ? new CeFalseHostNode()
            : new PlainHostNode();
      // slot value: a non-inline ElementNode holding text
      const value = $createParagraphNode();
      const text = $createTextNode('Before');
      value.append(text);
      $getRoot().append(host);
      $setSlot(host, SLOT, value);
      hostKey = host.getKey();
      textKey = text.getKey();
    },
    {discrete: true},
  );

  const hostDom = editor.getElementByKey(hostKey)!;
  return {editor, hostDom, hostKey, rootElement, target, textKey};
}

function editorOf(el: HTMLElement): LexicalEditor | undefined {
  return (el as HTMLElement & {__lexicalEditor?: LexicalEditor})
    .__lexicalEditor;
}

interface CellResult {
  mounted: boolean;
  reparented: boolean;
  display: string;
  contentEditable: string;
  hasLexicalEditor: boolean;
  liveAfterUpdate: boolean;
  staysInTargetAfterUpdate: boolean;
  unmountParks: boolean;
}

function runCell(hostKind: HostKind, targetKind: TargetKind): CellResult {
  const {editor, hostDom, hostKey, target, textKey} = setup(
    hostKind,
    targetKind,
  );

  // pre-mount: the reconciler parks the container in the host DOM, hidden
  const parked = hostDom.querySelector<HTMLElement>(
    `[data-lexical-slot="${SLOT}"]`,
  )!;
  expect(parked).not.toBe(null);
  expect(parked.style.display).toBe('none');
  expect(parked.textContent).toBe('Before');

  const container = mountSlotContainer(editor, hostKey, SLOT, target);
  const mounted = container !== null;
  if (container === null) {
    throw new Error('mountSlotContainer returned null');
  }
  expect(container).toBe(parked);

  const result: Partial<CellResult> = {
    contentEditable: container.contentEditable,
    display: container.style.display,
    hasLexicalEditor: editorOf(container) === editor,
    mounted,
    reparented: container.parentElement === target,
  };

  // is the mounted subtree still live? mutate the slotted text afterwards.
  editor.update(
    () => {
      const text = $getNodeByKey(textKey);
      if ($isTextNode(text)) {
        text.setTextContent('After');
      }
    },
    {discrete: true},
  );
  result.liveAfterUpdate = container.textContent === 'After';
  result.staysInTargetAfterUpdate = container.parentElement === target;

  unmountSlotContainer(editor, hostKey, container);
  result.unmountParks =
    container.parentElement === hostDom &&
    container.style.display === 'none' &&
    hostDom.firstChild === container;

  return result as CellResult;
}

const HOSTS: HostKind[] = ['decorator', 'ce-false', 'plain'];
const TARGETS: TargetKind[] = ['inside-root', 'outside-root'];

describe('mountSlotContainer freedom (3 hosts x 2 targets)', () => {
  for (const hostKind of HOSTS) {
    for (const targetKind of TARGETS) {
      test(`${hostKind} host -> ${targetKind} target`, () => {
        const r = runCell(hostKind, targetKind);

        // --- placement is host-independent and target-independent ---
        expect(r.mounted).toBe(true);
        expect(r.reparented).toBe(true);
        expect(r.display).toBe('');

        // --- liveness: the slot subtree keeps reconciling wherever it sits ---
        expect(r.liveAfterUpdate).toBe(true);
        expect(r.staysInTargetAfterUpdate).toBe(true);

        // --- unmount parks it back as the leading hidden placeholder ---
        expect(r.unmountParks).toBe(true);

        // --- editability: decided by the HOST, not by the target ---
        // Reconciler ($applySlotEditable): decoratorHost || hostDom.contentEditable === 'false'
        //   => $markSlotEditable(container)  [contentEditable='true' + __lexicalEditor]
        // otherwise the container just inherits from its surroundings.
        if (hostKind === 'plain') {
          // no contenteditable attribute at all -> the DOM getter reports the
          // inherited value ('inherit' in happy-dom); nothing marks it as an
          // editing host of this editor.
          expect(r.contentEditable).toBe(INHERITED_CE);
          expect(r.hasLexicalEditor).toBe(false);
        } else {
          expect(r.contentEditable).toBe('true');
          expect(r.hasLexicalEditor).toBe(true);
        }
      });
    }
  }

  // The whole matrix in one assertion, so the recorded behaviour is the test.
  test('matrix snapshot', () => {
    const matrix: Record<string, CellResult> = {};
    for (const hostKind of HOSTS) {
      for (const targetKind of TARGETS) {
        matrix[`${hostKind} | ${targetKind}`] = runCell(hostKind, targetKind);
      }
    }

    const marked: CellResult = {
      contentEditable: 'true',
      display: '',
      hasLexicalEditor: true,
      liveAfterUpdate: true,
      mounted: true,
      reparented: true,
      staysInTargetAfterUpdate: true,
      unmountParks: true,
    };
    // A plain (editable) element host leaves the container to INHERIT
    // editability from wherever it is mounted. Inside the root that inherits
    // contentEditable=true; outside the root there is nothing to inherit from,
    // so the content is not editable — and there is no __lexicalEditor
    // back-pointer for lexical's event layer to find either.
    const inheriting: CellResult = {
      ...marked,
      contentEditable: INHERITED_CE,
      hasLexicalEditor: false,
    };

    expect(matrix).toEqual({
      'ce-false | inside-root': marked,
      'ce-false | outside-root': marked,
      'decorator | inside-root': marked,
      'decorator | outside-root': marked,
      'plain | inside-root': inheriting,
      'plain | outside-root': inheriting,
    });
  });

  // The editability contract is re-applied on every reconcile, which is what
  // carries setEditable(false) into a container mounted outside the root.
  test('setEditable(false) propagates to a container mounted outside the root (decorator host)', async () => {
    const {editor, hostKey, target} = setup('decorator', 'outside-root');
    const container = mountSlotContainer(editor, hostKey, SLOT, target)!;
    expect(container.contentEditable).toBe('true');
    expect(editorOf(container)).toBe(editor);

    editor.setEditable(false);
    await flush();
    expect(container.contentEditable).toBe('false');
    expect(editorOf(container)).toBe(undefined);
    // the $fullReconcile that setEditable schedules does NOT re-park the
    // container: it stays mounted where we put it, outside the root.
    expect(container.parentElement).toBe(target);
    expect(container.style.display).toBe('');

    editor.setEditable(true);
    await flush();
    expect(container.contentEditable).toBe('true');
    expect(editorOf(container)).toBe(editor);
    expect(container.parentElement).toBe(target);
  });

  test('mountSlotContainer returns null for an unknown slot name', () => {
    const {editor, hostKey, target} = setup('decorator', 'outside-root');
    expect(mountSlotContainer(editor, hostKey, 'nope', target)).toBe(null);
  });

  test('the mounted container lives outside the editor root element', () => {
    const {editor, hostKey, rootElement, target} = setup(
      'decorator',
      'outside-root',
    );
    const container = mountSlotContainer(editor, hostKey, SLOT, target)!;
    expect(rootElement.contains(container)).toBe(false);
    expect(document.body.contains(container)).toBe(true);
    expect(container.textContent).toBe('Before');
  });
});

/*
 * NEEDS-BROWSER: happy-dom has no caret / beforeinput / native selection, so
 * "contentEditable='true' + __lexicalEditor === editor" is only a structural
 * proxy for "typing here edits the document". Confirming that keystrokes and
 * selection inside a container mounted outside the root actually reach the
 * editor requires a real browser (Playwright).
 */
