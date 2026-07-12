import {
  $collectFootnoteRefs,
  footnoteNumbersOf,
  orderFootnoteIds,
} from '../model/numbering';
import {$getFootnoteSection} from '../nodes/FootnoteSectionNode';
import {$getDefinitionEntries} from '../model/slots';

export interface NoteView {
  footnoteId: string;
  number: number | '?';
  refCount: number;
}

export interface DerivedFootnotes {
  sectionKey: string | null;
  /** Display order: cited notes by number, then orphans. */
  orderedIds: string[];
  notes: NoteView[];
}

/**
 * Everything the UI derives from the document, from ONE walk. This runs on
 * every commit, and each of numbering, cue counts and display order sweeps the
 * whole tree on its own if asked separately — which is exactly what happened
 * once already, so the consumers now take this as input instead of asking.
 */
export function $deriveFootnotes(): DerivedFootnotes {
  const refs = $collectFootnoteRefs();
  const numbers = footnoteNumbersOf(refs);
  const section = $getFootnoteSection();
  const ids = section
    ? $getDefinitionEntries(section).map(entry => entry.footnoteId)
    : [];
  const orderedIds = orderFootnoteIds(ids, numbers);
  return {
    notes: orderedIds.map(footnoteId => ({
      footnoteId,
      number: numbers.get(footnoteId) ?? '?',
      refCount: refs.get(footnoteId)?.length ?? 0,
    })),
    orderedIds,
    sectionKey: section ? section.getKey() : null,
  };
}
