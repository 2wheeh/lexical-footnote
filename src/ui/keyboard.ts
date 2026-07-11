import {
  $getSelection,
  $isElementNode,
  $isNodeSelection,
  $isRangeSelection,
  registerEventListener,
  type LexicalEditor,
} from 'lexical';

import {$definitionAtSelection} from '../model/deletion';
import {
  $isFootnoteRefNode,
} from '../nodes/FootnoteRefNode';
import type {FootnoteDefinitionNode} from '../nodes/FootnoteDefinitionNode';
import type {BackrefOverlay} from './backrefs';
import {
  gotoDefinition,
  gotoNextDefinitionStart,
  gotoPreviousDefinitionOrBody,
} from './navigation';

/** The note the collapsed caret sits at the very end of. */
function $definitionAtSelectionEnd(): FootnoteDefinitionNode | null {
  const definition = $definitionAtSelection();
  const selection = $getSelection();
  if (!definition || !$isRangeSelection(selection)) {
    return null;
  }
  const {anchor} = selection;
  const anchorNode = anchor.getNode();
  const last = definition.getLastDescendant() ?? definition;
  if (anchor.type === 'text') {
    return anchorNode === last &&
      anchor.offset === anchorNode.getTextContentSize()
      ? definition
      : null;
  }
  return anchorNode === last ||
    ($isElementNode(anchorNode) &&
      anchorNode.getChildrenSize() === anchor.offset &&
      anchorNode.getLastDescendant() === last)
    ? definition
    : null;
}

/**
 * Is the caret on the note's first (or last) visual line? Measured, not
 * derived from the model: a single paragraph can wrap into several lines, and
 * inside those the arrow keys should keep moving by line as usual. We only
 * take over at the note's real top and bottom edge.
 */
function atNoteEdge(direction: 'up' | 'down'): boolean {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return false;
  }
  const anchor = selection.anchorNode;
  const element =
    anchor instanceof Element ? anchor : (anchor?.parentElement ?? null);
  const note = element?.closest('[data-lexical-footnote-def]');
  if (!note) {
    return false;
  }
  const caret = selection.getRangeAt(0).getBoundingClientRect();
  const box = note.getBoundingClientRect();
  // A collapsed range can measure as all-zeros; treat that as an edge rather
  // than trapping the caret in the note.
  if (caret.top === 0 && caret.bottom === 0) {
    return true;
  }
  const tolerance = 4;
  return direction === 'up'
    ? caret.top - box.top <= tolerance
    : box.bottom - caret.bottom <= tolerance;
}

/**
 * Keyboard routes that the browser cannot be trusted with, all registered on
 * the root element in the CAPTURE phase — bubbling keystrokes would reach
 * Lexical's own key handling first.
 */
export function registerFootnoteKeyboard(
  editor: LexicalEditor,
  rootElement: HTMLElement,
  overlay: BackrefOverlay,
): () => void {
  const onKeydown = (event: KeyboardEvent) => {
    const {key} = event;
    if (event.metaKey || event.ctrlKey || event.shiftKey) {
      return;
    }
    // Plain and Alt (word-jump) ArrowRight both stop at the note's end and
    // hand focus to that note's first backref.
    if (key === 'ArrowRight') {
      const footnoteId = editor.read(
        () => $definitionAtSelectionEnd()?.getFootnoteId() ?? null,
      );
      const first = footnoteId ? overlay.firstButton(footnoteId) : null;
      if (first) {
        event.preventDefault();
        event.stopPropagation();
        first.focus();
      }
      return;
    }
    // Vertical movement between notes is ours, in every browser. Each note is
    // its own editable island (that is what a slot container is), and Firefox
    // will not carry the caret across one: ArrowUp/ArrowDown there only walk to
    // the island's own start and end, so the notes are a keyboard dead end.
    // Chrome and Safari happen to cross — not a behavior to rely on, and not
    // one to let differ.
    if (key === 'ArrowUp' || key === 'ArrowDown') {
      const footnoteId = editor.read(
        () => $definitionAtSelection()?.getFootnoteId() ?? null,
      );
      if (footnoteId && atNoteEdge(key === 'ArrowUp' ? 'up' : 'down')) {
        event.preventDefault();
        event.stopPropagation();
        if (key === 'ArrowUp') {
          gotoPreviousDefinitionOrBody(editor, footnoteId);
        } else {
          gotoNextDefinitionStart(editor, footnoteId);
        }
      }
      return;
    }
    if (event.altKey) {
      return;
    }
    // Enter on a selected cue follows it down to its note.
    if (key === 'Enter') {
      const refId = editor.read(() => {
        const selection = $getSelection();
        if (!$isNodeSelection(selection)) {
          return null;
        }
        const nodes = selection.getNodes();
        return nodes.length === 1 && $isFootnoteRefNode(nodes[0])
          ? nodes[0].getFootnoteId()
          : null;
      });
      if (refId) {
        event.preventDefault();
        event.stopPropagation();
        gotoDefinition(editor, refId);
      }
    }
  };
  return registerEventListener(rootElement, 'keydown', onKeydown, {
    capture: true,
  });
}
