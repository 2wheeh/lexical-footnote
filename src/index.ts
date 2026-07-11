export {
  $createFootnoteDefinitionNode,
  $isFootnoteDefinitionNode,
  FootnoteDefinitionNode,
} from './nodes/FootnoteDefinitionNode';
export {
  $cleanupOrphanFootnotes,
  $computeFootnoteNumbers,
  $getFootnoteDefinition,
  $getFootnoteDefinitions,
  $getFootnoteSection,
  $getOrderedFootnoteIds,
  $removeFootnote,
  $removeFootnoteDefinition,
  FootnoteExtension,
  INSERT_FOOTNOTE_COMMAND,
  type FootnoteConfig,
} from './FootnoteExtension';
export {backrefLabel, backrefTargetId} from './io/gfm';
// A note can be cited many times: `$getFootnoteRefs` returns every cue for it,
// in document order.
export {$getFootnoteRefs, orderFootnoteIds} from './model/numbering';
export {
  $getDefinitionEntries,
  $getDefinitionSlot,
  footnoteSlotName,
} from './model/slots';
export {
  $createFootnoteRefNode,
  $isFootnoteRefNode,
  FootnoteRefNode,
} from './nodes/FootnoteRefNode';
export {
  $createFootnoteSectionNode,
  $isFootnoteSectionNode,
  FootnoteSectionNode,
} from './nodes/FootnoteSectionNode';
export {FootnoteImportRules} from './io/htmlImport';
export {createFootnoteId, footnoteIdState} from './model/state';
