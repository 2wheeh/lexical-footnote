import {$getSlot, $getSlotNames, $removeSlot, $setSlot} from 'lexical';

import {
  $isFootnoteDefinitionNode,
  type FootnoteDefinitionNode,
} from '../nodes/FootnoteDefinitionNode';
import type {FootnoteSectionNode} from '../nodes/FootnoteSectionNode';

/**
 * Definitions live in named slots on the section, keyed by footnote id —
 * the slot map IS the GFM definition map. One definition per identifier is
 * therefore structural, not a transform. Slot names are canonicalized in
 * code-unit order, so display and export order is always derived from
 * reference order (see `numbering.ts`), never read off the slot map.
 */
const SLOT_PREFIX = 'fn:';

export function footnoteSlotName(footnoteId: string): string {
  return `${SLOT_PREFIX}${footnoteId}`;
}

export function footnoteIdFromSlotName(name: string): string | null {
  return name.startsWith(SLOT_PREFIX) ? name.slice(SLOT_PREFIX.length) : null;
}

export function $getDefinitionSlot(
  section: FootnoteSectionNode,
  footnoteId: string,
): FootnoteDefinitionNode | null {
  const node = $getSlot(section, footnoteSlotName(footnoteId));
  return $isFootnoteDefinitionNode(node) ? node : null;
}

export function $setDefinitionSlot(
  section: FootnoteSectionNode,
  footnoteId: string,
  definition: FootnoteDefinitionNode,
): void {
  $setSlot(section, footnoteSlotName(footnoteId), definition);
}

export function $removeDefinitionSlot(
  section: FootnoteSectionNode,
  footnoteId: string,
): void {
  $removeSlot(section, footnoteSlotName(footnoteId));
}

/** Every definition the section holds, in slot-map (i.e. arbitrary) order. */
export function $getDefinitionEntries(
  section: FootnoteSectionNode,
): {footnoteId: string; definition: FootnoteDefinitionNode}[] {
  const entries: {footnoteId: string; definition: FootnoteDefinitionNode}[] =
    [];
  for (const name of $getSlotNames(section)) {
    const footnoteId = footnoteIdFromSlotName(name);
    if (footnoteId === null) {
      continue;
    }
    const definition = $getSlot(section, name);
    if ($isFootnoteDefinitionNode(definition)) {
      entries.push({definition, footnoteId});
    }
  }
  return entries;
}
