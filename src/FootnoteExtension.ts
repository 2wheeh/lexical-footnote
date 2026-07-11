import {signal} from '@lexical/extension';
import {CoreImportExtension, DOMImportExtension} from '@lexical/html';
import {$dfs, mergeRegister} from '@lexical/utils';
import {
  $caretFromPoint,
  $createNodeSelection,
  $createParagraphNode,
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $getSiblingCaret,
  $isElementNode,
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
}

function gotoRef(editor: LexicalEditor, footnoteId: string): void {
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

/**
 * Backspace/delete adjacent to a cue selects it first instead of deleting
 * it outright (Word/Notion behavior). NodeCaret recipe from the Lexical
 * maintainers; $normalizeCaret handles cues wrapped in e.g. MarkNode.
 */
function $selectRefOnDeleteCharacter(isBackward: boolean): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
    return false;
  }
  const {anchor} = selection;
  if (
    anchor.type === 'text' &&
    (isBackward
      ? anchor.offset > 0
      : anchor.offset < anchor.getNode().getTextContentSize())
  ) {
    // Deleting within a text node, not across a node boundary.
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
    const onRootClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      const li = target.closest('[data-lexical-footnote-def]');
      if (!li) {
        return;
      }
      // The backref is a ::after pseudo-element (and the number a ::marker),
      // so those clicks land on the pseudo's owner (li / content div / the
      // paragraph carrying the backref while the trailing paragraph is
      // empty); clicks on the note's text land on deeper elements (spans)
      // and fall through to editing.
      const isEmptyParagraph = (el: Element | null): boolean =>
        el?.tagName === 'P' &&
        el.childElementCount === 1 &&
        el.firstElementChild?.tagName === 'BR';
      const isChrome =
        target === li ||
        (target instanceof HTMLElement &&
          target.hasAttribute('data-lexical-footnote-content')) ||
        (target.tagName === 'P' &&
          isEmptyParagraph(target.nextElementSibling) &&
          target.nextElementSibling === target.parentElement?.lastElementChild);
      if (!isChrome) {
        return;
      }
      const footnoteId = li.getAttribute('data-lexical-footnote-def');
      if (footnoteId) {
        event.preventDefault();
        output.gotoRef(footnoteId);
      }
    };
    let removeRootClick: (() => void) | null = null;
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
      () => removeRootClick?.(),
      editor.registerRootListener(rootElement => {
        removeRootClick?.();
        removeRootClick = rootElement
          ? registerEventListener(rootElement, 'click', onRootClick)
          : null;
      }),
      editor.registerCommand(
        DELETE_CHARACTER_COMMAND,
        $selectRefOnDeleteCharacter,
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerNodeTransform(RootNode, $removeRefsOfDeletedDefs),
      editor.registerUpdateListener(() => {
        knownDefIds = editor.read($collectDefIds);
      }),
      editor.registerCommand(
        INSERT_FOOTNOTE_COMMAND,
        () => {
          $insertFootnote();
          return true;
        },
        COMMAND_PRIORITY_EDITOR,
      ),
      // Not a mutation listener: those only fire with DOM reconciliation,
      // which never happens in headless usage (tests, SSR, export workers).
      editor.registerUpdateListener(
        ({dirtyLeaves, editorState, prevEditorState}) => {
          if (dirtyLeaves.size === 0) {
            return;
          }
          const $hasDirtyRef = () => {
            for (const key of dirtyLeaves) {
              if ($isFootnoteRefNode($getNodeByKey(key))) {
                return true;
              }
            }
            return false;
          };
          if (
            editorState.read($hasDirtyRef) ||
            prevEditorState.read($hasDirtyRef)
          ) {
            recomputeNumbers();
          }
        },
      ),
      editor.registerNodeTransform(FootnoteRefNode, $refTransform),
      editor.registerNodeTransform(FootnoteDefinitionNode, $defTransform),
      editor.registerNodeTransform(FootnoteSectionNode, $sectionTransform),
      editor.registerNodeTransform(RootNode, $rootTransform),
    );
  },
});
