import {signal} from '@lexical/extension';
import {
  CoreImportExtension,
  DOMImportExtension,
  DOMRenderExtension,
} from '@lexical/html';
import {$dfs, mergeRegister} from '@lexical/utils';
import {
  $caretFromPoint,
  $createNodeSelection,
  $createParagraphNode,
  $getRoot,
  $getSelection,
  $getSiblingCaret,
  $getSlotHost,
  $isElementNode,
  $isNodeSelection,
  $isRangeSelection,
  $isTextPointCaret,
  $nodesOfType,
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
  FootnoteSectionRenderOverride,
} from './FootnoteSectionNode';
import {FootnoteImportRules} from './htmlImport';
import {$computeFootnoteNumbers, orderFootnoteIds} from './numbering';
import {
  $getDefinitionEntries,
  $getDefinitionSlot,
  $removeDefinitionSlot,
  $setDefinitionSlot,
} from './slots';
import {createFootnoteId} from './state';

export {$computeFootnoteNumbers} from './numbering';

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

/** O(1): the slot map is the definition map, keyed by footnote id. */
export function $getFootnoteDefinition(
  footnoteId: string,
): FootnoteDefinitionNode | null {
  const section = $getFootnoteSection();
  return section ? $getDefinitionSlot(section, footnoteId) : null;
}

export function $getFirstFootnoteRef(footnoteId: string): FootnoteRefNode | null {
  // Order-sensitive (the FIRST ref), so this walks the body in document
  // order rather than reading the unordered node map.
  for (const {node} of $dfs()) {
    if ($isFootnoteRefNode(node) && node.getFootnoteId() === footnoteId) {
      return node;
    }
  }
  return null;
}

/** Definition ids in display order (referenced by number, then orphans). */
export function $getOrderedFootnoteIds(): string[] {
  const section = $getFootnoteSection();
  if (!section) {
    return [];
  }
  const ids = $getDefinitionEntries(section).map(entry => entry.footnoteId);
  return orderFootnoteIds(ids, $computeFootnoteNumbers());
}

/**
 * Every definition, in display order. Definitions are slot values on the
 * section, so they are not reachable through `section.getChildren()`.
 */
export function $getFootnoteDefinitions(): FootnoteDefinitionNode[] {
  const section = $getFootnoteSection();
  if (!section) {
    return [];
  }
  const definitions: FootnoteDefinitionNode[] = [];
  for (const footnoteId of $getOrderedFootnoteIds()) {
    const definition = $getDefinitionSlot(section, footnoteId);
    if (definition) {
      definitions.push(definition);
    }
  }
  return definitions;
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
/**
 * Removes just the definition, leaving its refs behind — they are cleaned up
 * by the same-update policy in $removeRefsOfDeletedDefs. Definitions are slot
 * values, so `definition.remove()` (a children-channel operation) does not
 * detach them; this is the way.
 */
export function $removeFootnoteDefinition(footnoteId: string): void {
  const section = $getFootnoteSection();
  if (section) {
    $removeDefinitionSlot(section, footnoteId);
  }
}

export function $removeFootnote(footnoteId: string): void {
  // Order-insensitive: read the node map instead of walking the tree.
  for (const ref of $nodesOfType(FootnoteRefNode)) {
    if (ref.getFootnoteId() === footnoteId) {
      ref.remove();
    }
  }
  const section = $getFootnoteSection();
  if (section) {
    $removeDefinitionSlot(section, footnoteId);
  }
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
  for (const {footnoteId} of $getDefinitionEntries(section)) {
    if (!numbers.has(footnoteId)) {
      $removeDefinitionSlot(section, footnoteId);
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
  $setDefinitionSlot(section, id, definition);
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
 * Definition lookup that also sees definitions not yet slotted — importers
 * produce them as ordinary nodes, and $defTransform slots them on commit.
 * Reads the node map, so it finds them in either channel.
 */
function $findFootnoteDefinitionAnywhere(
  footnoteId: string,
): FootnoteDefinitionNode | null {
  for (const definition of $nodesOfType(FootnoteDefinitionNode)) {
    if (definition.getFootnoteId() === footnoteId) {
      return definition;
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
    $setDefinitionSlot($ensureFootnoteSection(), id, definition);
  }
}

/**
 * Definitions belong in the section's slot map, keyed by id. Importers append
 * them as ordinary nodes wherever the source put them; `$setSlot` unlinks a
 * node from its parent, so slotting one here relocates it. One definition per
 * identifier needs no dedup pass: a slot name can only hold one node.
 */
function $defTransform(node: FootnoteDefinitionNode): void {
  const id = node.getFootnoteId();
  if (!id) {
    node.remove();
    return;
  }
  const section = $ensureFootnoteSection();
  if ($getSlotHost(node) !== section) {
    const occupant = $getDefinitionSlot(section, id);
    // A healed placeholder never wins over imported content.
    if (occupant && occupant !== node && node.getTextContent().trim() === '') {
      node.remove();
      return;
    }
    $setDefinitionSlot(section, id, node);
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
  // Single section: move a duplicate's definitions into the first one.
  const sections = root.getChildren().filter($isFootnoteSectionNode);
  const survivor = sections[0];
  if (survivor && node !== survivor) {
    for (const {footnoteId, definition} of $getDefinitionEntries(node)) {
      $setDefinitionSlot(survivor, footnoteId, definition);
    }
    node.remove();
    return;
  }
  if (node.getParent() !== root) {
    root.append(node);
    return;
  }
  // isEmpty() is slot-aware: true only when it holds no definitions either.
  if (node.isEmpty()) {
    node.remove();
    return;
  }
  if (root.getLastChild() !== node) {
    root.append(node);
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
    // Lets the reconciler attach each definition's slot container itself,
    // in-commit — no imperative mount racing it for the section's DOM.
    /* @__PURE__ */ configExtension(DOMRenderExtension, {
      overrides: [FootnoteSectionRenderOverride],
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
    // Definitions are slot values: they have no siblings. Traversal follows
    // the derived display order instead.
    const gotoNextDefinitionStart = (footnoteId: string) => {
      editor.focus(() => {
        editor.update(
          () => {
            const ids = $getOrderedFootnoteIds();
            const nextId = ids[ids.indexOf(footnoteId) + 1];
            const next = nextId ? $getFootnoteDefinition(nextId) : null;
            if (next) {
              next.selectStart();
            } else {
              $getFootnoteDefinition(footnoteId)?.selectEnd();
            }
          },
          {tag: 'footnote-navigation'},
        );
      });
    };
    const gotoPreviousDefinitionOrBody = (footnoteId: string) => {
      editor.focus(() => {
        editor.update(
          () => {
            const ids = $getOrderedFootnoteIds();
            const index = ids.indexOf(footnoteId);
            const previousId = index > 0 ? ids[index - 1] : undefined;
            const previous = previousId
              ? $getFootnoteDefinition(previousId)
              : null;
            if (previous) {
              previous.selectEnd();
              return;
            }
            // First note: continue up into the body, right above the section.
            const body = $getFootnoteSection()?.getPreviousSibling();
            if (body) {
              body.selectEnd();
            } else {
              $getRoot().selectStart();
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
        } else if (key === 'ArrowUp') {
          // Up into the previous note, or the body above the section.
          event.preventDefault();
          gotoPreviousDefinitionOrBody(footnoteId);
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
      for (const content of Array.from(
        rootElement.querySelectorAll('[data-lexical-footnote-def]'),
      )) {
        const footnoteId = content.getAttribute('data-lexical-footnote-def');
        if (!footnoteId) {
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
    /**
     * The reconciler owns the section's DOM (it creates each definition's
     * `<li>` through the render override) — we only project the derived
     * display order onto it. Slot-map order is code-unit order, so the list
     * is a flex column ordered by `--order`, never by DOM position.
     */
    const syncSectionOrder = () => {
      const {sectionKey, orderedIds} = editor.read(() => {
        const section = $getFootnoteSection();
        return {
          orderedIds: $getOrderedFootnoteIds(),
          sectionKey: section ? section.getKey() : null,
        };
      });
      if (sectionKey === null) {
        return;
      }
      const list = editor
        .getElementByKey(sectionKey)
        ?.querySelector('[data-lexical-footnote-list]');
      if (!(list instanceof HTMLElement)) {
        return;
      }
      orderedIds.forEach((footnoteId, index) => {
        const item = list.querySelector(
          `[data-lexical-footnote-item="${footnoteId}"]`,
        );
        if (item instanceof HTMLElement) {
          item.style.setProperty('--order', String(index + 1));
          item.style.order = String(index + 1);
        }
      });
    };
    const scheduleSectionSync = () => {
      const rootElement = currentRoot;
      if (!rootElement) {
        return;
      }
      const run = () => {
        if (currentRoot !== rootElement) {
          return;
        }
        syncSectionOrder();
        if (overlay) {
          positionBackrefs(rootElement);
        }
      };
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(run);
      } else {
        run();
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
      const section = $getFootnoteSection();
      return new Set(
        section
          ? $getDefinitionEntries(section).map(entry => entry.footnoteId)
          : [],
      );
    };
    const $removeRefsOfDeletedDefs = (): void => {
      const currentIds = $collectDefIds();
      for (const id of knownDefIds) {
        if (!currentIds.has(id)) {
          for (const ref of $nodesOfType(FootnoteRefNode)) {
            if (ref.getFootnoteId() === id) {
              ref.remove();
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
        syncSectionOrder();
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
        scheduleSectionSync();
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
