import {signal} from '@lexical/extension';
import {CoreImportExtension, DOMImportExtension} from '@lexical/html';
import {$dfs, mergeRegister} from '@lexical/utils';
import {
  $caretFromPoint,
  $createNodeSelection,
  $createParagraphNode,
  $getRoot,
  $getSelection,
  $getSiblingCaret,
  $isElementNode,
  $isNodeSelection,
  $isRangeSelection,
  $isTextPointCaret,
  $setSelection,
  COMMAND_PRIORITY_EDITOR,
  COMMAND_PRIORITY_LOW,
  configExtension,
  createCommand,
  defineExtension,
  DELETE_CHARACTER_COMMAND,
  registerEventListener,
  RootNode,
  TextNode,
  type LexicalCommand,
  type LexicalEditor,
} from 'lexical';

import {
  $createFootnoteDefinitionNode,
  $isFootnoteDefinitionNode,
  FootnoteDefinitionNode,
} from './FootnoteDefinitionNode';
import {
  $createFootnoteRefNode,
  $isFootnoteRefNode,
  FootnoteRefNode,
} from './FootnoteRefNode';
import {
  $createFootnoteSectionNode,
  $isFootnoteSectionNode,
  FootnoteSectionNode,
} from './FootnoteSectionNode';
import {FootnoteImportRules} from './htmlImport';
import {createFootnoteId} from './state';

export const INSERT_FOOTNOTE_COMMAND: LexicalCommand<void> =
  /* @__PURE__ */ createCommand('INSERT_FOOTNOTE_COMMAND');

export function $getFootnoteSection(): FootnoteSectionNode | null {
  for (const child of $getRoot().getChildren()) {
    if ($isFootnoteSectionNode(child)) {
      return child;
    }
  }
  return null;
}

function $ensureFootnoteSection(): FootnoteSectionNode {
  const existing = $getFootnoteSection();
  if (existing) {
    return existing;
  }
  const section = $createFootnoteSectionNode();
  $getRoot().append(section);
  return section;
}

export function $getFootnoteDefinition(
  footnoteId: string,
): FootnoteDefinitionNode | null {
  const section = $getFootnoteSection();
  if (!section) {
    return null;
  }
  for (const child of section.getChildren()) {
    if (
      $isFootnoteDefinitionNode(child) &&
      child.getFootnoteId() === footnoteId
    ) {
      return child;
    }
  }
  return null;
}

export function $getFirstFootnoteRef(footnoteId: string): FootnoteRefNode | null {
  for (const {node} of $dfs()) {
    if ($isFootnoteRefNode(node) && node.getFootnoteId() === footnoteId) {
      return node;
    }
  }
  return null;
}

/**
 * Display numbers, derived from the document order of first references
 * (GFM numbering). Never stored on nodes.
 */
export function $computeFootnoteNumbers(): ReadonlyMap<string, number> {
  const numbers = new Map<string, number>();
  for (const {node} of $dfs()) {
    if ($isFootnoteRefNode(node)) {
      const id = node.getFootnoteId();
      if (id && !numbers.has(id)) {
        numbers.set(id, numbers.size + 1);
      }
    }
  }
  return numbers;
}

function mapsEqual(
  a: ReadonlyMap<string, number>,
  b: ReadonlyMap<string, number>,
): boolean {
  if (a.size !== b.size) {
    return false;
  }
  for (const [k, v] of a) {
    if (b.get(k) !== v) {
      return false;
    }
  }
  return true;
}

/**
 * Removes every ref with this id and its definition. This is the explicit
 * "delete footnote" operation; merely deleting a definition in the editor
 * leaves its refs dangling (they heal an empty definition when next
 * touched).
 */
export function $removeFootnote(footnoteId: string): void {
  for (const {node} of $dfs()) {
    if ($isFootnoteRefNode(node) && node.getFootnoteId() === footnoteId) {
      node.remove();
    }
  }
  $getFootnoteDefinition(footnoteId)?.remove();
}

/**
 * Removes definitions that no ref points to. Orphans are otherwise kept
 * (so a plain undo after deleting a ref restores everything); this is the
 * explicit, permanent cleanup — mirroring tiptap's cleanupOrphanFootnotes.
 *
 * @returns true when at least one orphaned definition was removed.
 */
export function $cleanupOrphanFootnotes(): boolean {
  const section = $getFootnoteSection();
  if (!section) {
    return false;
  }
  const numbers = $computeFootnoteNumbers();
  let removed = false;
  for (const child of section.getChildren()) {
    if ($isFootnoteDefinitionNode(child) && !numbers.has(child.getFootnoteId())) {
      child.remove();
      removed = true;
    }
  }
  return removed;
}

function $insertFootnote(): void {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) {
    return;
  }
  // Word/tiptap semantics: selected text is kept and the marker goes after
  // the selection, so collapse to the end instead of replacing.
  if (!selection.isCollapsed()) {
    const end = selection.isBackward() ? selection.anchor : selection.focus;
    selection.anchor.set(end.key, end.offset, end.type);
    selection.focus.set(end.key, end.offset, end.type);
  }
  const id = createFootnoteId();
  selection.insertNodes([$createFootnoteRefNode(id)]);
  const section = $ensureFootnoteSection();
  const definition = $createFootnoteDefinitionNode(id);
  const paragraph = $createParagraphNode();
  definition.append(paragraph);
  section.append(definition);
  paragraph.selectStart();
}

function $scrollToKey(editor: LexicalEditor, key: string): void {
  const dom = editor.getElementByKey(key);
  if (dom && typeof dom.scrollIntoView === 'function') {
    dom.scrollIntoView({behavior: 'smooth', block: 'nearest'});
  }
}

function gotoDefinition(editor: LexicalEditor, footnoteId: string): void {
  // focus first: navigation may be triggered from outside the editor
  // (e.g. the keyboard-focused backref button), and DOM selection only
  // syncs while the editor is focused.
  editor.focus(() => {
    editor.update(
      () => {
        const definition = $getFootnoteDefinition(footnoteId);
        if (definition) {
          definition.selectStart();
          $scrollToKey(editor, definition.getKey());
        }
      },
      {tag: 'footnote-navigation'},
    );
  });
}

function gotoRef(editor: LexicalEditor, footnoteId: string): void {
  editor.focus(() => {
    editor.update(
      () => {
        const ref = $getFirstFootnoteRef(footnoteId);
        if (ref) {
          ref.selectEnd();
          $scrollToKey(editor, ref.getKey());
        }
      },
      {tag: 'footnote-navigation'},
    );
  });
}

/**
 * Definition lookup that also sees definitions not yet relocated into the
 * section (e.g. mid-import, before $defTransform has moved them).
 */
function $findFootnoteDefinitionAnywhere(
  footnoteId: string,
): FootnoteDefinitionNode | null {
  for (const {node} of $dfs()) {
    if (
      $isFootnoteDefinitionNode(node) &&
      node.getFootnoteId() === footnoteId
    ) {
      return node;
    }
  }
  return null;
}

/** Dangling ref (no definition) heals itself by creating one. */
function $refTransform(node: FootnoteRefNode): void {
  const id = node.getFootnoteId();
  if (!id) {
    node.remove();
    return;
  }
  if (!$findFootnoteDefinitionAnywhere(id)) {
    const definition = $createFootnoteDefinitionNode(id);
    definition.append($createParagraphNode());
    $ensureFootnoteSection().append(definition);
  }
}

function $defTransform(node: FootnoteDefinitionNode): void {
  if (!node.getFootnoteId()) {
    node.remove();
    return;
  }
  const parent = node.getParent();
  if (!$isFootnoteSectionNode(parent)) {
    $ensureFootnoteSection().append(node);
    return;
  }
  if (node.isEmpty()) {
    node.append($createParagraphNode());
  }
}

function $sectionTransform(node: FootnoteSectionNode): void {
  if (!node.isAttached()) {
    return;
  }
  const root = $getRoot();
  // Single section: merge later duplicates into the first one.
  const sections = root.getChildren().filter($isFootnoteSectionNode);
  const survivor = sections[0];
  if (survivor && node !== survivor) {
    for (const child of node.getChildren()) {
      survivor.append(child);
    }
    node.remove();
    return;
  }
  if (node.getParent() !== root) {
    root.append(node);
    return;
  }
  if (node.isEmpty()) {
    node.remove();
    return;
  }
  if (root.getLastChild() !== node) {
    root.append(node);
  }
  // Dedupe by id (GFM: one definition per identifier). Prefer a definition
  // with content over an empty auto-healed one.
  const byId = new Map<string, FootnoteDefinitionNode>();
  for (const def of node.getChildren().filter($isFootnoteDefinitionNode)) {
    const id = def.getFootnoteId();
    const kept = byId.get(id);
    if (!kept) {
      byId.set(id, def);
    } else if (
      kept.getTextContent().trim() === '' &&
      def.getTextContent().trim() !== ''
    ) {
      kept.remove();
      byId.set(id, def);
    } else {
      def.remove();
    }
  }
  // Order definitions to match first-reference order; orphans keep their
  // relative order at the end (GFM keeps unreferenced definitions).
  const numbers = $computeFootnoteNumbers();
  const definitions = node.getChildren().filter($isFootnoteDefinitionNode);
  const desired = [...definitions].sort((a, b) => {
    const an = numbers.get(a.getFootnoteId()) ?? Number.MAX_SAFE_INTEGER;
    const bn = numbers.get(b.getFootnoteId()) ?? Number.MAX_SAFE_INTEGER;
    return an - bn;
  });
  if (desired.some((def, i) => def !== definitions[i])) {
    for (const def of desired) {
      node.append(def);
    }
  }
}

/** Keep the section pinned as the last child of the root. */
function $rootTransform(node: RootNode): void {
  const section = $getFootnoteSection();
  if (section && node.getLastChild() !== section) {
    node.append(section);
  }
}

const REF_SHORTCUT_REGEX = /\[\^([^\s[\]]+)\]/;

/**
 * Typing shortcut: literal `[^id]` in body text materializes a cue (the
 * definition heals into existence via $refTransform). Skips code-formatted
 * text.
 */
function $textToRefTransform(node: TextNode): void {
  if (!node.isSimpleText() || node.hasFormat('code')) {
    return;
  }
  const match = REF_SHORTCUT_REGEX.exec(node.getTextContent());
  if (!match) {
    return;
  }
  const start = match.index;
  const parts = node.splitText(start, start + match[0].length);
  const target = (start === 0 ? parts[0] : parts[1]) ?? null;
  if (target) {
    const ref = $createFootnoteRefNode(match[1]!);
    target.replace(ref);
    ref.selectEnd();
  }
}

/**
 * Backspace/delete adjacent to a cue selects it first instead of deleting
 * it outright; a second delete removes it.
 */
function $selectRefOnDeleteCharacter(isBackward: boolean): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
    return false;
  }
  const {anchor} = selection;
  // Only act at node boundaries; mid-text deletion stays default.
  if (
    anchor.type === 'text' &&
    (isBackward
      ? anchor.offset > 0
      : anchor.offset < anchor.getNode().getTextContentSize())
  ) {
    return false;
  }
  const pointCaret = $caretFromPoint(anchor, isBackward ? 'previous' : 'next');
  const nodeCaret = $isTextPointCaret(pointCaret)
    ? $getSiblingCaret(pointCaret.origin, pointCaret.direction)
    : pointCaret;
  let node = nodeCaret.getNodeAtCaret();
  // Descend into wrapping inline elements (e.g. MarkNode around the cue).
  while ($isElementNode(node)) {
    node = isBackward ? node.getLastChild() : node.getFirstChild();
  }
  if (!$isFootnoteRefNode(node)) {
    return false;
  }
  const nodeSelection = $createNodeSelection();
  nodeSelection.add(node.getKey());
  $setSelection(nodeSelection);
  return true;
}

export const FootnoteExtension = defineExtension({
  dependencies: [
    CoreImportExtension,
    /* @__PURE__ */ configExtension(DOMImportExtension, {
      rules: FootnoteImportRules,
    }),
  ],
  build: (editor: LexicalEditor) => {
    const numbers = signal<ReadonlyMap<string, number>>(new Map());
    return {
      cleanupOrphans: (): boolean => {
        let removed = false;
        editor.update(
          () => {
            removed = $cleanupOrphanFootnotes();
          },
          {discrete: true},
        );
        return removed;
      },
      gotoDefinition: (footnoteId: string) =>
        gotoDefinition(editor, footnoteId),
      gotoRef: (footnoteId: string) => gotoRef(editor, footnoteId),
      insertFootnote: () =>
        editor.dispatchCommand(INSERT_FOOTNOTE_COMMAND, undefined),
      numbers,
    };
  },
  name: 'lexical-footnote/Footnote',
  nodes: () => [FootnoteRefNode, FootnoteSectionNode, FootnoteDefinitionNode],
  register: (editor, _config, state) => {
    const output = state.getOutput();
    const recomputeNumbers = () => {
      const next = editor.read($computeFootnoteNumbers);
      if (!mapsEqual(next, output.numbers.peek())) {
        output.numbers.value = next;
      }
    };
    // Returns the definition whose very end the collapsed selection sits at.
    const $definitionAtSelectionEnd = (): FootnoteDefinitionNode | null => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
        return null;
      }
      const anchor = selection.anchor;
      let definition: FootnoteDefinitionNode | null = null;
      for (
        let node: ReturnType<typeof anchor.getNode> | null = anchor.getNode();
        node;
        node = node.getParent()
      ) {
        if ($isFootnoteDefinitionNode(node)) {
          definition = node;
          break;
        }
      }
      if (!definition) {
        return null;
      }
      const anchorNode = anchor.getNode();
      const last = definition.getLastDescendant() ?? definition;
      if (anchor.type === 'text') {
        return anchorNode === last &&
          anchor.offset === anchorNode.getTextContentSize()
          ? definition
          : null;
      }
      return anchorNode === last ||
        ($isElementNode(anchorNode) &&
          anchorNode.getChildrenSize() === anchor.offset &&
          anchorNode.getLastDescendant() === last)
        ? definition
        : null;
    };
    // Backref markers are real buttons in an overlay layer OUTSIDE the
    // contentEditable, absolutely positioned after each note's last line
    // (the FindReplace decoration pattern). Inside the editable they would
    // be caret-movement targets that Lexical mis-resolves; as a pseudo-
    // element they could take neither focus nor precise clicks. Out here
    // the paragraph DOM stays fully native (correct caret everywhere) and
    // click/focus/a11y come for free.
    let overlay: HTMLElement | null = null;
    let currentRoot: HTMLElement | null = null;
    const backrefButtons = new Map<string, HTMLButtonElement>();
    const returnToNoteEnd = (footnoteId: string, thenInsert?: string) => {
      editor.focus(() => {
        editor.update(
          () => {
            $getFootnoteDefinition(footnoteId)?.selectEnd();
            if (thenInsert) {
              const selection = $getSelection();
              if ($isRangeSelection(selection)) {
                selection.insertText(thenInsert);
              }
            }
          },
          {tag: 'footnote-navigation'},
        );
      });
    };
    const gotoNextDefinitionStart = (footnoteId: string) => {
      editor.focus(() => {
        editor.update(
          () => {
            const definition = $getFootnoteDefinition(footnoteId);
            const next = definition?.getNextSibling();
            if ($isFootnoteDefinitionNode(next)) {
              next.selectStart();
            } else {
              definition?.selectEnd();
            }
          },
          {tag: 'footnote-navigation'},
        );
      });
    };
    const createBackrefButton = (footnoteId: string): HTMLButtonElement => {
      const button = document.createElement('button');
      button.type = 'button';
      // Roving focus: reached with ArrowRight from the end of a note, not
      // Tab — the editor should be a single tab stop for the page.
      button.tabIndex = -1;
      button.className = 'lexical-footnote__backref';
      button.setAttribute('aria-label', 'Back to reference');
      button.textContent = '↩';
      button.addEventListener('click', event => {
        event.preventDefault();
        output.gotoRef(footnoteId);
      });
      button.addEventListener('keydown', event => {
        if (event.metaKey || event.ctrlKey) {
          return;
        }
        const {key} = event;
        if (
          !event.altKey &&
          !event.shiftKey &&
          (key === 'Enter' || key === ' ')
        ) {
          event.preventDefault();
          output.gotoRef(footnoteId);
        } else if (key === 'ArrowLeft' || key === 'Escape') {
          event.preventDefault();
          returnToNoteEnd(footnoteId);
        } else if (key === 'ArrowRight' || key === 'ArrowDown') {
          // Continue past the backref into the next note.
          event.preventDefault();
          gotoNextDefinitionStart(footnoteId);
        } else if (!event.altKey && key.length === 1) {
          // Typing on the focused backref continues at the note end.
          event.preventDefault();
          returnToNoteEnd(footnoteId, key);
        }
      });
      return button;
    };
    /** End of the note's last line, in viewport coordinates. */
    const measureNoteEnd = (
      content: Element,
    ): {x: number; top: number; height: number} => {
      const lastBlock = content.lastElementChild ?? content;
      const walker = document.createTreeWalker(lastBlock, NodeFilter.SHOW_TEXT);
      let lastText: Text | null = null;
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (n.textContent) {
          lastText = n as Text;
        }
      }
      if (lastText) {
        const range = document.createRange();
        range.selectNodeContents(lastText);
        const rects = range.getClientRects();
        const rect = rects[rects.length - 1];
        if (rect) {
          return {height: rect.height, top: rect.top, x: rect.right};
        }
      }
      // Empty note (or empty trailing paragraph): start of that line.
      const rect = lastBlock.getBoundingClientRect();
      const lineHeight =
        Number.parseFloat(getComputedStyle(lastBlock).lineHeight) ||
        rect.height;
      return {
        height: Math.min(lineHeight, rect.height || lineHeight),
        top: rect.top,
        x: rect.left,
      };
    };
    const positionBackrefs = (rootElement: HTMLElement) => {
      if (!overlay) {
        return;
      }
      const overlayRect = overlay.getBoundingClientRect();
      const seen = new Set<string>();
      for (const li of Array.from(
        rootElement.querySelectorAll('[data-lexical-footnote-def]'),
      )) {
        const footnoteId = li.getAttribute('data-lexical-footnote-def');
        const content = li.querySelector('[data-lexical-footnote-content]');
        if (!footnoteId || !content) {
          continue;
        }
        seen.add(footnoteId);
        let button = backrefButtons.get(footnoteId);
        if (!button) {
          button = createBackrefButton(footnoteId);
          backrefButtons.set(footnoteId, button);
          overlay.appendChild(button);
        }
        const end = measureNoteEnd(content);
        button.style.left = `${end.x - overlayRect.left + 3}px`;
        button.style.top = `${end.top - overlayRect.top}px`;
        button.style.lineHeight = `${Math.round(end.height)}px`;
      }
      for (const [id, button] of backrefButtons) {
        if (!seen.has(id)) {
          button.remove();
          backrefButtons.delete(id);
        }
      }
    };
    const schedulePositionBackrefs = () => {
      const rootElement = currentRoot;
      if (!rootElement || !overlay) {
        return;
      }
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => {
          if (currentRoot === rootElement) {
            positionBackrefs(rootElement);
          }
        });
      } else {
        positionBackrefs(rootElement);
      }
    };
    const onRootKeydown = (event: KeyboardEvent) => {
      const {key} = event;
      if (event.metaKey || event.ctrlKey || event.shiftKey) {
        return;
      }
      // Plain and Alt (word-jump) ArrowRight both stop at the note end and
      // hand focus to that note's backref button. Capture phase: bubbling
      // keystrokes reach Lexical's own key handling first otherwise.
      if (key === 'ArrowRight') {
        const footnoteId = editor.read(
          () => $definitionAtSelectionEnd()?.getFootnoteId() ?? null,
        );
        const button = footnoteId ? backrefButtons.get(footnoteId) : null;
        if (button) {
          event.preventDefault();
          event.stopPropagation();
          button.focus();
        }
        return;
      }
      if (event.altKey) {
        return;
      }
      if (key === 'Enter') {
        const refId = editor.read(() => {
          const selection = $getSelection();
          if (!$isNodeSelection(selection)) {
            return null;
          }
          const nodes = selection.getNodes();
          return nodes.length === 1 && $isFootnoteRefNode(nodes[0])
            ? nodes[0].getFootnoteId()
            : null;
        });
        if (refId) {
          event.preventDefault();
          event.stopPropagation();
          output.gotoDefinition(refId);
        }
      }
    };
    let removeRootHandlers: (() => void) | null = null;
    // Definition ids as of the last committed state; lets the RootNode
    // transform detect "a definition was deleted" (destroys are invisible
    // to per-node transforms) and apply the policy: deleting a definition
    // deletes its refs, in the same update so undo restores both.
    let knownDefIds: ReadonlySet<string> = new Set();
    const $collectDefIds = (): ReadonlySet<string> => {
      const ids = new Set<string>();
      const section = $getFootnoteSection();
      if (section) {
        for (const child of section.getChildren()) {
          if ($isFootnoteDefinitionNode(child)) {
            ids.add(child.getFootnoteId());
          }
        }
      }
      return ids;
    };
    const $removeRefsOfDeletedDefs = (): void => {
      const currentIds = $collectDefIds();
      for (const id of knownDefIds) {
        if (!currentIds.has(id)) {
          for (const {node} of $dfs()) {
            if ($isFootnoteRefNode(node) && node.getFootnoteId() === id) {
              node.remove();
            }
          }
        }
      }
    };
    return mergeRegister(
      () => removeRootHandlers?.(),
      editor.registerRootListener(rootElement => {
        removeRootHandlers?.();
        removeRootHandlers = null;
        overlay?.remove();
        overlay = null;
        backrefButtons.clear();
        currentRoot = rootElement;
        if (!rootElement) {
          return;
        }
        const overlayElement = document.createElement('div');
        overlayElement.className = 'lexical-footnote__backref-overlay';
        rootElement.insertAdjacentElement('afterend', overlayElement);
        overlay = overlayElement;
        positionBackrefs(rootElement);
        removeRootHandlers = mergeRegister(
          registerEventListener(rootElement, 'keydown', onRootKeydown, {
            capture: true,
          }),
          typeof window !== 'undefined'
            ? registerEventListener(window, 'resize', () =>
                positionBackrefs(rootElement),
              )
            : () => {},
          () => {
            overlayElement.remove();
            backrefButtons.clear();
          },
        );
      }),
      editor.registerCommand(
        DELETE_CHARACTER_COMMAND,
        $selectRefOnDeleteCharacter,
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerNodeTransform(RootNode, $removeRefsOfDeletedDefs),
      // Recompute on every update: dirty-set gating misses refs inside
      // wholesale subtree operations (clear, move, undo/redo's historic
      // state swaps), and mapsEqual keeps the signal referentially stable.
      // Not a mutation listener: those only fire with DOM reconciliation,
      // which never happens in headless usage (tests, SSR, export workers).
      editor.registerUpdateListener(() => {
        recomputeNumbers();
        knownDefIds = editor.read($collectDefIds);
        schedulePositionBackrefs();
      }),
      editor.registerCommand(
        INSERT_FOOTNOTE_COMMAND,
        () => {
          $insertFootnote();
          return true;
        },
        COMMAND_PRIORITY_EDITOR,
      ),
      editor.registerNodeTransform(TextNode, $textToRefTransform),
      editor.registerNodeTransform(FootnoteRefNode, $refTransform),
      editor.registerNodeTransform(FootnoteDefinitionNode, $defTransform),
      editor.registerNodeTransform(FootnoteSectionNode, $sectionTransform),
      editor.registerNodeTransform(RootNode, $rootTransform),
    );
  },
});
