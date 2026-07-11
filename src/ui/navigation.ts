import {$getRoot, $getSelection, $isRangeSelection, type LexicalEditor} from 'lexical';

import {
  $getFootnoteDefinition,
  $getOrderedFootnoteIds,
} from '../model/definitions';
import {$getFootnoteRefs} from '../model/numbering';
import {$getFootnoteSection} from '../nodes/FootnoteSectionNode';

/**
 * Jumping around the footnotes. Every one of these focuses the editor first:
 * a jump can be triggered from outside it — a backref button in the overlay
 * has real DOM focus — and the DOM selection only syncs while the editor is
 * focused.
 *
 * Tagged `footnote-navigation` so a consumer can tell a jump apart from an
 * edit in an update listener.
 */

function $scrollToKey(editor: LexicalEditor, key: string): void {
  const dom = editor.getElementByKey(key);
  if (dom && typeof dom.scrollIntoView === 'function') {
    dom.scrollIntoView({behavior: 'smooth', block: 'nearest'});
  }
}

function navigate(editor: LexicalEditor, $jump: () => void): void {
  editor.focus(() => {
    editor.update($jump, {tag: 'footnote-navigation'});
  });
}

export function gotoDefinition(editor: LexicalEditor, footnoteId: string): void {
  navigate(editor, () => {
    const definition = $getFootnoteDefinition(footnoteId);
    if (definition) {
      definition.selectStart();
      $scrollToKey(editor, definition.getKey());
    }
  });
}

/** `occurrence` is 1-based: a note cited twice has a backref to each cue. */
export function gotoRef(
  editor: LexicalEditor,
  footnoteId: string,
  occurrence = 1,
): void {
  navigate(editor, () => {
    const ref = $getFootnoteRefs(footnoteId)[occurrence - 1];
    if (ref) {
      ref.selectEnd();
      $scrollToKey(editor, ref.getKey());
    }
  });
}

/** The end of a note — where typing on a focused backref should continue. */
export function returnToNoteEnd(
  editor: LexicalEditor,
  footnoteId: string,
  thenInsert?: string,
): void {
  navigate(editor, () => {
    $getFootnoteDefinition(footnoteId)?.selectEnd();
    if (thenInsert) {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        selection.insertText(thenInsert);
      }
    }
  });
}

// Definitions are slot values: they have no siblings. Traversal follows the
// derived display order instead.

export function gotoNextDefinitionStart(
  editor: LexicalEditor,
  footnoteId: string,
): void {
  navigate(editor, () => {
    const ids = $getOrderedFootnoteIds();
    const nextId = ids[ids.indexOf(footnoteId) + 1];
    const next = nextId ? $getFootnoteDefinition(nextId) : null;
    if (next) {
      next.selectStart();
    } else {
      $getFootnoteDefinition(footnoteId)?.selectEnd();
    }
  });
}

export function gotoPreviousDefinitionOrBody(
  editor: LexicalEditor,
  footnoteId: string,
): void {
  navigate(editor, () => {
    const ids = $getOrderedFootnoteIds();
    const index = ids.indexOf(footnoteId);
    const previousId = index > 0 ? ids[index - 1] : undefined;
    const previous = previousId ? $getFootnoteDefinition(previousId) : null;
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
  });
}
