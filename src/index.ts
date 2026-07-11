export {
  $createFootnoteDefinitionNode,
  $isFootnoteDefinitionNode,
  FootnoteDefinitionNode,
} from './FootnoteDefinitionNode';
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
} from './FootnoteExtension';
export {backrefLabel, backrefTargetId} from './gfm';
// A note can be cited many times: `$getFootnoteRefs` returns every cue for it,
// in document order.
export {$getFootnoteRefs, orderFootnoteIds} from './numbering';
export {
  $getDefinitionEntries,
  $getDefinitionSlot,
  footnoteSlotName,
} from './slots';
export {
  $createFootnoteRefNode,
  $isFootnoteRefNode,
  FootnoteRefNode,
} from './FootnoteRefNode';
export {
  $createFootnoteSectionNode,
  $isFootnoteSectionNode,
  FootnoteSectionNode,
} from './FootnoteSectionNode';
export {FootnoteImportRules} from './htmlImport';
export {createFootnoteId, footnoteIdState} from './state';
