import {
  $createParagraphNode,
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_EDITOR,
  createCommand,
  type LexicalCommand,
  type LexicalEditor,
} from 'lexical';

import {$createFootnoteDefinitionNode} from '../nodes/FootnoteDefinitionNode';
import {$createFootnoteRefNode} from '../nodes/FootnoteRefNode';
import {$ensureFootnoteSection} from './definitions';
import {$setDefinitionSlot} from './slots';
import {createFootnoteId} from './state';

export const INSERT_FOOTNOTE_COMMAND: LexicalCommand<void> =
  /* @__PURE__ */ createCommand('INSERT_FOOTNOTE_COMMAND');

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
  const definition = $createFootnoteDefinitionNode(id);
  const paragraph = $createParagraphNode();
  definition.append(paragraph);
  $setDefinitionSlot($ensureFootnoteSection(), id, definition);
  // Straight into the new note: that is what the author is about to write.
  paragraph.selectStart();
}

export function registerFootnoteInsert(editor: LexicalEditor): () => void {
  return editor.registerCommand(
    INSERT_FOOTNOTE_COMMAND,
    () => {
      $insertFootnote();
      return true;
    },
    COMMAND_PRIORITY_EDITOR,
  );
}
