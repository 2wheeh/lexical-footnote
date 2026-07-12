import {mergeRegister} from '@lexical/utils';
import {
  $createParagraphNode,
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $getSlotHost,
  $isRangeSelection,
  RootNode,
  TextNode,
  type LexicalEditor,
} from 'lexical';

import {
  $createFootnoteDefinitionNode,
  FootnoteDefinitionNode,
} from '../nodes/FootnoteDefinitionNode';
import {
  $createFootnoteRefNode,
  FootnoteRefNode,
} from '../nodes/FootnoteRefNode';
import {
  $getFootnoteSection,
  $isFootnoteSectionNode,
  FootnoteSectionNode,
} from '../nodes/FootnoteSectionNode';
import {
  $ensureFootnoteSection,
  $findFootnoteDefinitionAnywhere,
} from './definitions';
import {
  $getDefinitionEntries,
  $getDefinitionSlot,
  $setDefinitionSlot,
} from './slots';

/**
 * The invariants that hold no matter how the document was arrived at — typed,
 * pasted, imported, undone. Each is a node transform, so it re-runs until the
 * document satisfies it, and it does so in the same update as the change that
 * broke it (which is what keeps undo atomic).
 */

/** A cue with no definition heals itself by creating one. */
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

/** One section, and never stranded inside another block. */
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
  // A section that ended up nested inside another block ($rootTransform only
  // looks among the root's own children, so it would never find it again).
  if (node.getParent() !== root) {
    root.append(node);
    return;
  }
  // isEmpty() is slot-aware: true only when it holds no definitions either.
  if (node.isEmpty()) {
    node.remove();
  }
  // Pinning it last is $rootTransform's job — content arriving after it
  // dirties the root, which is what has to trigger the move.
}

/**
 * The section is the last block of the document. Lives on the RootNode rather
 * than the section, because what puts it out of place is content arriving
 * *after* it — which dirties the root, not the section.
 */
function $rootTransform(node: RootNode): void {
  const section = $getFootnoteSection();
  if (!section) {
    return;
  }
  if (node.getLastChild() !== section) {
    node.append(section);
  }
  // Never the root's only child. Orphaned notes keep the section alive when
  // the whole body is deleted (a body-scoped select-all stops at the
  // non-editable shell, so the section itself survives the range) — but a
  // root holding only the section isn't "empty" to Lexical, so no paragraph
  // gets auto-created, and the shell offers no caret position: the editor
  // would be unusable. Restore a body paragraph, and give the caret a home
  // if the deletion left the selection with none.
  if (node.getChildrenSize() === 1) {
    const paragraph = $createParagraphNode();
    section.insertBefore(paragraph);
    // Only rescue a caret that has nowhere to live — a deletion that took
    // the body leaves the selection pointing at a detached node (not null;
    // stale, and still in the node map until reconciliation garbage-collects
    // it, so it must be tested via isAttached). A valid caret, e.g. sitting
    // inside a note island, must not be yanked into the new paragraph.
    const selection = $getSelection();
    const anchorNode = $isRangeSelection(selection)
      ? $getNodeByKey(selection.anchor.key)
      : null;
    if (selection === null || anchorNode === null || !anchorNode.isAttached()) {
      paragraph.selectStart();
    }
  }
}

const REF_SHORTCUT_REGEX = /\[\^([^\s[\]]+)\]/;

/**
 * Typing shortcut: a literal `[^id]` materializes a cue (whose definition then
 * heals into existence via $refTransform). Skips code-formatted text.
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

export function registerFootnoteTransforms(editor: LexicalEditor): () => void {
  return mergeRegister(
    editor.registerNodeTransform(TextNode, $textToRefTransform),
    editor.registerNodeTransform(FootnoteRefNode, $refTransform),
    editor.registerNodeTransform(FootnoteDefinitionNode, $defTransform),
    editor.registerNodeTransform(FootnoteSectionNode, $sectionTransform),
    editor.registerNodeTransform(RootNode, $rootTransform),
  );
}
