import type {LexicalEditor} from 'lexical';

import {$getOrderedFootnoteIds} from '../model/definitions';
import {$collectFootnoteRefs, footnoteNumbersOf} from '../model/numbering';
import {backrefLabel} from '../io/gfm';
import {
  gotoNextDefinitionStart,
  gotoPreviousDefinitionOrBody,
  gotoRef,
  returnToNoteEnd,
} from './navigation';

/**
 * The backref markers are real buttons in an overlay layer OUTSIDE the
 * contentEditable, absolutely positioned after each note's last line (the
 * FindReplace decoration pattern). Inside the editable they would be
 * caret-movement targets that Lexical mis-resolves; as a pseudo-element they
 * could take neither focus nor precise clicks. Out here the note's DOM stays
 * fully native — correct caret everywhere — and click, focus and a11y come for
 * free.
 *
 * One button per cue, as in GFM: a note cited three times can be left in three
 * directions, and each backref leads to its own cue.
 */
export class BackrefOverlay {
  private overlay: HTMLElement | null = null;
  private groups = new Map<string, HTMLElement>();

  constructor(private readonly editor: LexicalEditor) {}

  /** Mounts the overlay layer next to (not inside) the editor's root element. */
  attach(rootElement: HTMLElement): void {
    this.detach();
    const overlay = document.createElement('div');
    overlay.className = 'lexical-footnote__backref-overlay';
    rootElement.insertAdjacentElement('afterend', overlay);
    this.overlay = overlay;
  }

  detach(): void {
    this.overlay?.remove();
    this.overlay = null;
    this.groups.clear();
  }

  /** The first backref of a note — where ArrowRight from its end lands. */
  firstButton(footnoteId: string): HTMLElement | null {
    const first = this.groups.get(footnoteId)?.firstElementChild;
    return first instanceof HTMLElement ? first : null;
  }

  /**
   * Structure only — it runs on commit, when the model is the source of truth.
   * Where the groups sit on screen needs layout, and waits for the frame.
   */
  sync(): void {
    const overlay = this.overlay;
    if (!overlay) {
      return;
    }
    // One walk of the document for all three derivations.
    const notes = this.editor.read(() => {
      const refs = $collectFootnoteRefs();
      const numbers = footnoteNumbersOf(refs);
      return $getOrderedFootnoteIds().map(footnoteId => ({
        footnoteId,
        number: numbers.get(footnoteId) ?? '?',
        refCount: refs.get(footnoteId)?.length ?? 0,
      }));
    });
    const live = new Set(notes.map(note => note.footnoteId));
    for (const [footnoteId, group] of this.groups) {
      if (!live.has(footnoteId)) {
        group.remove();
        this.groups.delete(footnoteId);
      }
    }
    for (const {footnoteId, number, refCount} of notes) {
      const existing = this.groups.get(footnoteId);
      // Rebuilt rather than diffed when the cue count changes: adding or
      // deleting a cue renumbers every backref after it anyway.
      if (existing && existing.childElementCount === refCount) {
        continue;
      }
      existing?.remove();
      const group = document.createElement('span');
      group.className = 'lexical-footnote__backrefs';
      group.dataset.footnoteId = footnoteId;
      for (let occurrence = 1; occurrence <= refCount; occurrence++) {
        group.appendChild(this.createButton(footnoteId, occurrence, number));
      }
      this.groups.set(footnoteId, group);
      overlay.appendChild(group);
    }
  }

  /** Places each group at the end of its note's last line. Needs layout. */
  position(rootElement: HTMLElement): void {
    const overlay = this.overlay;
    if (!overlay) {
      return;
    }
    const overlayRect = overlay.getBoundingClientRect();
    for (const [footnoteId, group] of this.groups) {
      const note = rootElement.querySelector(
        `[data-lexical-footnote-def="${footnoteId}"]`,
      );
      if (!note) {
        continue;
      }
      const end = measureNoteEnd(note);
      group.style.left = `${end.x - overlayRect.left + 3}px`;
      group.style.top = `${end.top - overlayRect.top}px`;
      group.style.lineHeight = `${Math.round(end.height)}px`;
    }
  }

  private createButton(
    footnoteId: string,
    occurrence: number,
    footnoteNumber: number | string,
  ): HTMLButtonElement {
    const {editor} = this;
    const button = document.createElement('button');
    button.type = 'button';
    // Roving focus: reached with ArrowRight from the end of a note, not Tab —
    // the editor should be a single tab stop for the page.
    button.tabIndex = -1;
    button.className = 'lexical-footnote__backref';
    button.dataset.occurrence = String(occurrence);
    button.setAttribute('aria-label', backrefLabel(footnoteNumber, occurrence));
    button.append('↩');
    if (occurrence > 1) {
      const sup = document.createElement('sup');
      sup.textContent = String(occurrence);
      button.appendChild(sup);
    }
    const sibling = (step: number): HTMLElement | null => {
      const next =
        step > 0 ? button.nextElementSibling : button.previousElementSibling;
      return next instanceof HTMLElement ? next : null;
    };
    button.addEventListener('click', event => {
      event.preventDefault();
      gotoRef(editor, footnoteId, occurrence);
    });
    button.addEventListener('keydown', event => {
      if (event.metaKey || event.ctrlKey) {
        return;
      }
      const {key} = event;
      if (!event.altKey && !event.shiftKey && (key === 'Enter' || key === ' ')) {
        event.preventDefault();
        gotoRef(editor, footnoteId, occurrence);
      } else if (key === 'ArrowLeft' || key === 'Escape') {
        event.preventDefault();
        const previous = key === 'ArrowLeft' ? sibling(-1) : null;
        if (previous) {
          previous.focus();
        } else {
          returnToNoteEnd(editor, footnoteId);
        }
      } else if (key === 'ArrowRight' || key === 'ArrowDown') {
        // Along this note's backrefs first, then on to the next note.
        event.preventDefault();
        const next = key === 'ArrowRight' ? sibling(1) : null;
        if (next) {
          next.focus();
        } else {
          gotoNextDefinitionStart(editor, footnoteId);
        }
      } else if (key === 'ArrowUp') {
        event.preventDefault();
        gotoPreviousDefinitionOrBody(editor, footnoteId);
      } else if (!event.altKey && key.length === 1) {
        // Typing on a focused backref continues at the note's end.
        event.preventDefault();
        returnToNoteEnd(editor, footnoteId, key);
      }
    });
    return button;
  }
}

/** End of the note's last line, in viewport coordinates. */
function measureNoteEnd(note: Element): {
  x: number;
  top: number;
  height: number;
} {
  const lastBlock = note.lastElementChild ?? note;
  const walker = document.createTreeWalker(lastBlock, NodeFilter.SHOW_TEXT);
  let lastText: Text | null = null;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.textContent) {
      lastText = n as Text;
    }
  }
  if (lastText) {
    const range = document.createRange();
    range.selectNodeContents(lastText);
    const rects = range.getClientRects();
    const rect = rects[rects.length - 1];
    if (rect) {
      return {height: rect.height, top: rect.top, x: rect.right};
    }
  }
  // Empty note (or empty trailing paragraph): the start of that line.
  const rect = lastBlock.getBoundingClientRect();
  const lineHeight =
    Number.parseFloat(getComputedStyle(lastBlock).lineHeight) || rect.height;
  return {
    height: Math.min(lineHeight, rect.height || lineHeight),
    top: rect.top,
    x: rect.left,
  };
}
