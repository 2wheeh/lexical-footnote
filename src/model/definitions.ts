import {$getRoot, $nodesOfType} from 'lexical';

import {
  FootnoteDefinitionNode,
  type FootnoteDefinitionNode as Definition,
} from '../nodes/FootnoteDefinitionNode';
import {FootnoteRefNode} from '../nodes/FootnoteRefNode';
import {
  $createFootnoteSectionNode,
  $getFootnoteSection,
  type FootnoteSectionNode,
} from '../nodes/FootnoteSectionNode';
import {$computeFootnoteNumbers, orderFootnoteIds} from './numbering';
import {
  $getDefinitionEntries,
  $getDefinitionSlot,
  $removeDefinitionSlot,
} from './slots';

/**
 * Reading and removing footnotes. The definitions are named slots on the
 * section — the slot map IS the definition map, keyed by footnote id — so none
 * of this goes through `section.getChildren()`, and `definition.remove()` (a
 * children-channel operation) cannot detach one.
 */

export function $ensureFootnoteSection(): FootnoteSectionNode {
  const existing = $getFootnoteSection();
  if (existing) {
    return existing;
  }
  const section = $createFootnoteSectionNode();
  $getRoot().append(section);
  return section;
}

/** O(1): the slot map is the definition map, keyed by footnote id. */
export function $getFootnoteDefinition(footnoteId: string): Definition | null {
  const section = $getFootnoteSection();
  return section ? $getDefinitionSlot(section, footnoteId) : null;
}

/** Definition ids in display order: cited ones by number, then orphans. */
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
export function $getFootnoteDefinitions(): Definition[] {
  const section = $getFootnoteSection();
  if (!section) {
    return [];
  }
  const definitions: Definition[] = [];
  for (const footnoteId of $getOrderedFootnoteIds()) {
    const definition = $getDefinitionSlot(section, footnoteId);
    if (definition) {
      definitions.push(definition);
    }
  }
  return definitions;
}

/**
 * Definition lookup that also sees definitions not yet slotted — importers
 * produce them as ordinary nodes, and $defTransform slots them on commit.
 * Reads the node map, so it finds them in either channel.
 */
export function $findFootnoteDefinitionAnywhere(
  footnoteId: string,
): Definition | null {
  for (const definition of $nodesOfType(FootnoteDefinitionNode)) {
    if (definition.getFootnoteId() === footnoteId) {
      return definition;
    }
  }
  return null;
}

/**
 * Removes just the definition; its cues follow in the same update (see
 * `deletion.ts`). Definitions are slot values, so `definition.remove()` — a
 * children-channel operation — does not detach them; this is the way.
 */
export function $removeFootnoteDefinition(footnoteId: string): void {
  const section = $getFootnoteSection();
  if (section) {
    $removeDefinitionSlot(section, footnoteId);
  }
}

/** Removes the whole footnote: every cue for it, and the definition. */
export function $removeFootnote(footnoteId: string): void {
  // Order-insensitive: read the node map instead of walking the tree.
  for (const ref of $nodesOfType(FootnoteRefNode)) {
    if (ref.getFootnoteId() === footnoteId) {
      ref.remove();
    }
  }
  $removeFootnoteDefinition(footnoteId);
}

/**
 * Removes definitions that no cue points to — the ones whose cues the user
 * deleted, and the ones that never had a cue (GFM allows a definition nothing
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
