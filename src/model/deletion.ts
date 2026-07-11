import {mergeRegister} from '@lexical/utils';
import {
  $caretFromPoint,
  $createNodeSelection,
  $getRoot,
  $getSelection,
  $getSiblingCaret,
  $isElementNode,
  $isRangeSelection,
  $isTextPointCaret,
  $nodesOfType,
  $setSelection,
  COMMAND_PRIORITY_LOW,
  DELETE_CHARACTER_COMMAND,
  RootNode,
  type LexicalEditor,
} from 'lexical';

import {$isFootnoteRefNode, FootnoteRefNode} from '../nodes/FootnoteRefNode';
import {
  $getFootnoteSection,
  type FootnoteSectionNode,
} from '../nodes/FootnoteSectionNode';
import {$definitionAtSelection, $removeFootnoteDefinition} from './definitions';
import {$getDefinitionEntries} from './slots';

/**
 * Deleting a footnote. A definition is a slot value: it has no siblings, and
 * no caret in the body can reach it, so none of the ordinary deletion paths
 * touch one. The policy that fills the gap:
 *
 * - deleting a cue leaves an orphan note. The deletion stays recoverable, and
 *   a cut cue can be pasted back onto its note; $cleanupOrphanFootnotes is the
 *   explicit discard.
 * - deleting a note deletes every cue pointing at it.
 * - emptying a note and deleting again deletes the note itself — the only way
 *   to delete one from the keyboard.
 * - emptying the whole document takes the section with it.
 *
 * Each propagation happens in the SAME update as the deletion that triggered
 * it, so a single undo restores the whole footnote.
 */

/**
 * Emptying a note and deleting again removes it. A definition has no siblings
 * to merge into, so the ordinary "backspace at the start of a block" path can
 * never delete one; without this there is no keyboard route to it at all.
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
 * Backspace/delete adjacent to a cue selects it first instead of deleting it
 * outright; a second delete removes it.
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

function $collectDefIds(): ReadonlySet<string> {
  const section = $getFootnoteSection();
  return new Set(
    section ? $getDefinitionEntries(section).map(e => e.footnoteId) : [],
  );
}

function $collectRefIds(): ReadonlySet<string> {
  // Reads the node map, so it sees cues inside notes too.
  return new Set(
    [...$nodesOfType(FootnoteRefNode)].map(ref => ref.getFootnoteId()),
  );
}

/** Nothing left in the document but the footnote section. */
function $bodyIsEmpty(section: FootnoteSectionNode): boolean {
  const body = $getRoot()
    .getChildren()
    .filter(child => child !== section);
  return (
    body.length > 0 &&
    body.every(child => $isElementNode(child) && child.isEmpty())
  );
}

export function registerFootnoteDeletion(editor: LexicalEditor): () => void {
  // Cue and definition ids as of the last committed state. Destroys are
  // invisible to per-node transforms, so a RootNode transform diffs these
  // snapshots to see what the user deleted, and propagates it.
  let knownDefIds: ReadonlySet<string> = new Set();
  let knownRefIds: ReadonlySet<string> = new Set();

  const $propagateDeletions = (): void => {
    const defIds = $collectDefIds();
    const refIds = $collectRefIds();
    // Deleting a definition deletes its cues. The converse does not hold: a
    // cue-less definition is a legal GFM orphan (importers produce them too),
    // so it survives its cues, and cleanup is what discards it.
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
    // annotate, so the section goes too (one undo brings it all back). Gated
    // on the document having *had* cues, so that a document which merely
    // arrives cue-less (an import of nothing but definitions) is left alone.
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
    editor.registerCommand(
      DELETE_CHARACTER_COMMAND,
      (isBackward: boolean) =>
        $deleteEmptyDefinition() || $selectRefOnDeleteCharacter(isBackward),
      COMMAND_PRIORITY_LOW,
    ),
    editor.registerNodeTransform(RootNode, $propagateDeletions),
    editor.registerUpdateListener(() => {
      editor.read(() => {
        knownDefIds = $collectDefIds();
        knownRefIds = $collectRefIds();
      });
    }),
  );
}
