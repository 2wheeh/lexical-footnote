import {signal} from '@lexical/extension';
import {
  CoreImportExtension,
  DOMImportExtension,
  DOMRenderExtension,
} from '@lexical/html';
import {mergeRegister} from '@lexical/utils';
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
  type LexicalNode,
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
import {backrefLabel} from './gfm';
import {FootnoteImportRules} from './htmlImport';
import {
  $computeFootnoteNumbers,
  $getFootnoteRefs,
  orderFootnoteIds,
} from './numbering';
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
 * Removes just the definition; its refs follow in the same update (see
 * $propagateDeletions). Definitions are slot values, so `definition.remove()`
 * — a children-channel operation — does not detach them; this is the way.
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
 * Removes definitions that no ref points to — the ones whose refs the user
 * deleted, and the ones that never had a ref (GFM allows a definition nothing
 * refers to, and both importers preserve them). Orphans are kept by default so
 * that deleting a cue is recoverable and cutting one still carries its note;
 * this is the explicit, permanent discard — tiptap's cleanupOrphanFootnotes.
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

/** `occurrence` is 1-based: a note cited twice has a backref to each cue. */
function gotoRef(
  editor: LexicalEditor,
  footnoteId: string,
  occurrence = 1,
): void {
  editor.focus(() => {
    editor.update(
      () => {
        const ref = $getFootnoteRefs(footnoteId)[occurrence - 1];
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

/** The definition the collapsed selection sits inside, if any. */
function $definitionAtSelection(): FootnoteDefinitionNode | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
    return null;
  }
  for (
    let node: LexicalNode | null = selection.anchor.getNode();
    node;
    node = node.getParent()
  ) {
    if ($isFootnoteDefinitionNode(node)) {
      return node;
    }
  }
  return null;
}

/**
 * Emptying a note and deleting again removes it — the only way to delete a
 * definition from the keyboard. A definition is a slot value: it has no
 * siblings to merge into, and no caret in the body can reach it, so the
 * ordinary "backspace at the start of a block" path can never delete one.
 * Its refs follow it out (see $propagateDeletions), so a single undo brings
 * the whole footnote back.
 */
function $deleteEmptyDefinition(): boolean {
  const definition = $definitionAtSelection();
  if (!definition || definition.getTextContent() !== '') {
    return false;
  }
  const body = $getFootnoteSection()?.getPreviousSibling();
  $removeFootnoteDefinition(definition.getFootnoteId());
  // The caret is inside the node being deleted; put it back in the document.
  if ($isElementNode(body)) {
    body.selectEnd();
  } else {
    $getRoot().selectEnd();
  }
  return true;
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

export interface FootnoteConfig {
  /**
   * Leave definitions nothing refers to out of the exported HTML, as GitHub
   * does when it renders. Off by default: this is a document editor, and an
   * orphan note is content the user wrote — dropping it from the model's own
   * serialization would be silent data loss. Turn it on when the HTML is a
   * rendering rather than a document, and you want byte-parity with GitHub.
   *
   * Markdown export is unaffected either way. GFM permits an orphan
   * definition in the source; it is only the HTML rendering that discards it.
   */
  dropOrphansOnExport: boolean;
}

// Annotated, not `satisfies`: the latter would narrow the default to the
// literal `false`, and the config could then never be set to anything else.
const DEFAULT_CONFIG: FootnoteConfig = {dropOrphansOnExport: false};

export const FootnoteExtension = defineExtension({
  config: DEFAULT_CONFIG,
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
      gotoRef: (footnoteId: string, occurrence?: number) =>
        gotoRef(editor, footnoteId, occurrence),
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
      const definition = $definitionAtSelection();
      const selection = $getSelection();
      if (!definition || !$isRangeSelection(selection)) {
        return null;
      }
      const anchor = selection.anchor;
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
    // One group per note, holding that note's backrefs — one per cue.
    const backrefGroups = new Map<string, HTMLElement>();
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
    /**
     * One button per cue, as in GFM: a note cited three times can be left in
     * three directions, and each backref leads to its own cue. ArrowRight
     * walks along them before continuing to the next note.
     */
    const createBackrefButton = (
      footnoteId: string,
      occurrence: number,
      footnoteNumber: number | string,
    ): HTMLButtonElement => {
      const button = document.createElement('button');
      button.type = 'button';
      // Roving focus: reached with ArrowRight from the end of a note, not
      // Tab — the editor should be a single tab stop for the page.
      button.tabIndex = -1;
      button.className = 'lexical-footnote__backref';
      button.dataset.occurrence = String(occurrence);
      button.setAttribute('aria-label', backrefLabel(footnoteNumber, occurrence));
      button.append('↩');
      if (occurrence > 1) {
        const sup = document.createElement('sup');
        sup.textContent = String(occurrence);
        button.appendChild(sup);
      }
      const siblingButton = (step: number): HTMLElement | null => {
        const next =
          step > 0 ? button.nextElementSibling : button.previousElementSibling;
        return next instanceof HTMLElement ? next : null;
      };
      button.addEventListener('click', event => {
        event.preventDefault();
        output.gotoRef(footnoteId, occurrence);
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
          output.gotoRef(footnoteId, occurrence);
        } else if (key === 'ArrowLeft' || key === 'Escape') {
          event.preventDefault();
          const previous = key === 'ArrowLeft' ? siblingButton(-1) : null;
          if (previous) {
            previous.focus();
          } else {
            returnToNoteEnd(footnoteId);
          }
        } else if (key === 'ArrowRight' || key === 'ArrowDown') {
          event.preventDefault();
          const next = key === 'ArrowRight' ? siblingButton(1) : null;
          if (next) {
            next.focus();
          } else {
            gotoNextDefinitionStart(footnoteId);
          }
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
    /**
     * A backref group per note, holding one button per cue. Structure only —
     * it runs on commit, when the model is the source of truth. Where the
     * groups sit on screen needs layout, and waits for the frame.
     */
    const syncBackrefGroups = () => {
      if (!overlay) {
        return;
      }
      const notes = editor.read(() =>
        $getOrderedFootnoteIds().map(footnoteId => ({
          footnoteId,
          number: $computeFootnoteNumbers().get(footnoteId) ?? '?',
          refCount: $getFootnoteRefs(footnoteId).length,
        })),
      );
      const live = new Set(notes.map(note => note.footnoteId));
      for (const [footnoteId, group] of backrefGroups) {
        if (!live.has(footnoteId)) {
          group.remove();
          backrefGroups.delete(footnoteId);
        }
      }
      for (const {footnoteId, number, refCount} of notes) {
        const existing = backrefGroups.get(footnoteId);
        // Rebuilt rather than diffed when the cue count changes: adding or
        // deleting a cue renumbers every backref after it anyway.
        if (existing && existing.childElementCount === refCount) {
          continue;
        }
        existing?.remove();
        const group = document.createElement('span');
        group.className = 'lexical-footnote__backrefs';
        group.dataset.footnoteId = footnoteId;
        for (let occurrence = 1; occurrence <= refCount; occurrence++) {
          group.appendChild(
            createBackrefButton(footnoteId, occurrence, number),
          );
        }
        backrefGroups.set(footnoteId, group);
        overlay.appendChild(group);
      }
    };
    const positionBackrefs = (rootElement: HTMLElement) => {
      if (!overlay) {
        return;
      }
      const overlayRect = overlay.getBoundingClientRect();
      for (const [footnoteId, group] of backrefGroups) {
        const content = rootElement.querySelector(
          `[data-lexical-footnote-def="${footnoteId}"]`,
        );
        if (!content) {
          continue;
        }
        const end = measureNoteEnd(content);
        group.style.left = `${end.x - overlayRect.left + 3}px`;
        group.style.top = `${end.top - overlayRect.top}px`;
        group.style.lineHeight = `${Math.round(end.height)}px`;
      }
    };
    /**
     * The `<li>`s are ours, not the reconciler's: the render override creates
     * one on demand as each definition's slot container needs a home, and the
     * reconciler only ever attaches and detaches the container *inside* it. So
     * an item whose definition is gone is ours to reclaim, or it lingers as an
     * empty numbered row.
     *
     * The rest is projection. Slot-map order is code-unit order of the ids, so
     * DOM order is meaningless: display order comes from `order` (a flex
     * column — moving the `<li>`s would move the DOM selection with them), and
     * the marker from `value`, since `::marker` counts DOM position.
     */
    const syncSectionList = () => {
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
      const live = new Set(orderedIds);
      for (const item of Array.from(
        list.querySelectorAll('[data-lexical-footnote-item]'),
      )) {
        if (!live.has(item.getAttribute('data-lexical-footnote-item') ?? '')) {
          item.remove();
        }
      }
      orderedIds.forEach((footnoteId, index) => {
        const item = list.querySelector(
          `[data-lexical-footnote-item="${footnoteId}"]`,
        );
        if (item instanceof HTMLLIElement) {
          item.style.order = String(index + 1);
          item.value = index + 1;
        }
      });
    };
    const scheduleBackrefs = () => {
      const rootElement = currentRoot;
      if (!rootElement || !overlay) {
        return;
      }
      // Measurement needs layout, so it waits for the frame; the list sync
      // above does not, and runs synchronously on commit.
      const run = () => {
        if (currentRoot === rootElement && overlay) {
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
      // hand focus to that note's first backref. Capture phase: bubbling
      // keystrokes reach Lexical's own key handling first otherwise.
      if (key === 'ArrowRight') {
        const footnoteId = editor.read(
          () => $definitionAtSelectionEnd()?.getFootnoteId() ?? null,
        );
        const first = footnoteId
          ? backrefGroups.get(footnoteId)?.firstElementChild
          : null;
        if (first instanceof HTMLElement) {
          event.preventDefault();
          event.stopPropagation();
          first.focus();
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
    // Ref and definition ids as of the last committed state. Destroys are
    // invisible to per-node transforms, so a RootNode transform diffs these
    // snapshots to see what the user deleted, and propagates it: a footnote
    // is one thing, and deleting either half deletes the other. Doing it in
    // the same update is what makes a single undo restore both.
    let knownDefIds: ReadonlySet<string> = new Set();
    let knownRefIds: ReadonlySet<string> = new Set();
    const $collectDefIds = (): ReadonlySet<string> => {
      const section = $getFootnoteSection();
      return new Set(
        section
          ? $getDefinitionEntries(section).map(entry => entry.footnoteId)
          : [],
      );
    };
    const $collectRefIds = (): ReadonlySet<string> =>
      new Set(
        [...$nodesOfType(FootnoteRefNode)].map(ref => ref.getFootnoteId()),
      );
    /** Nothing left in the document but the footnote section. */
    const $bodyIsEmpty = (section: FootnoteSectionNode): boolean => {
      const body = $getRoot()
        .getChildren()
        .filter(child => child !== section);
      return (
        body.length > 0 &&
        body.every(child => $isElementNode(child) && child.isEmpty())
      );
    };
    const $propagateDeletions = (): void => {
      const defIds = $collectDefIds();
      const refIds = $collectRefIds();
      // Deleting a definition deletes its refs. The converse does not hold:
      // a ref-less definition is a legal GFM orphan (importers produce them
      // too), so it survives its refs and $cleanupOrphanFootnotes is what
      // discards it.
      for (const id of knownDefIds) {
        if (!defIds.has(id)) {
          for (const ref of $nodesOfType(FootnoteRefNode)) {
            if (ref.getFootnoteId() === id) {
              ref.remove();
            }
          }
        }
      }
      // ...but notes belong to a document. When an edit empties the body of
      // everything — select-all + delete — there is nothing left for them to
      // annotate, so the section goes too (one undo brings it all back).
      // Gated on the document having *had* refs, so that a document which
      // merely arrives ref-less (an import of nothing but definitions) is
      // left alone.
      const section = $getFootnoteSection();
      if (
        section &&
        knownRefIds.size > 0 &&
        refIds.size === 0 &&
        $bodyIsEmpty(section)
      ) {
        section.remove();
      }
    };
    return mergeRegister(
      () => removeRootHandlers?.(),
      editor.registerRootListener(rootElement => {
        removeRootHandlers?.();
        removeRootHandlers = null;
        overlay?.remove();
        overlay = null;
        backrefGroups.clear();
        currentRoot = rootElement;
        if (!rootElement) {
          return;
        }
        const overlayElement = document.createElement('div');
        overlayElement.className = 'lexical-footnote__backref-overlay';
        rootElement.insertAdjacentElement('afterend', overlayElement);
        overlay = overlayElement;
        syncSectionList();
        syncBackrefGroups();
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
            backrefGroups.clear();
          },
        );
      }),
      editor.registerCommand(
        DELETE_CHARACTER_COMMAND,
        (isBackward: boolean) =>
          $deleteEmptyDefinition() || $selectRefOnDeleteCharacter(isBackward),
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerNodeTransform(RootNode, $propagateDeletions),
      // Recompute on every update: dirty-set gating misses refs inside
      // wholesale subtree operations (clear, move, undo/redo's historic
      // state swaps), and mapsEqual keeps the signal referentially stable.
      // Not a mutation listener: those only fire with DOM reconciliation,
      // which never happens in headless usage (tests, SSR, export workers).
      editor.registerUpdateListener(() => {
        recomputeNumbers();
        editor.read(() => {
          knownDefIds = $collectDefIds();
          knownRefIds = $collectRefIds();
        });
        syncSectionList();
        syncBackrefGroups();
        scheduleBackrefs();
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
