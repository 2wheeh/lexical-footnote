'use client';

/**
 * Isolated prototype for the roadmap's "Floating note editor / mirror view"
 * (ROADMAP.md). Promotion target: the lexical-footnote package — this file
 * is shaped so lifting it there later is a move, not a rewrite: it owns
 * everything about the feature (hover detection, positioning, dismiss) and
 * is consumed through one narrow entry point, <NotePreview shellRef={...}>.
 *
 * READ-ONLY by constraint, not by choice. A live, editable floating card
 * is not possible with today's Lexical public API: an editable island must
 * be a DOM descendant of editor.getRootElement() (input events bind to
 * that element, nothing else reaches the model), but the reconciler
 * removes any DOM node it doesn't itself track anywhere inside the root's
 * managed subtree on the next commit — the two requirements have no
 * overlap. Redirecting the slot container itself ($getSlotTargetElement
 * can be shadowed from the app) moves the note but breaks its editing for
 * the same reason. What would unblock it upstream is tracked on the
 * ROADMAP item.
 *
 * Positioning/interaction is @floating-ui/react — primitives rather than a
 * component library, since a promoted package feature shouldn't drag a UI
 * kit in for one popover.
 */

import {useEffect, useRef, useState} from 'react';
import {
  autoUpdate,
  flip,
  FloatingPortal,
  offset,
  safePolygon,
  shift,
  useDismiss,
  useFloating,
  useHover,
  useInteractions,
} from '@floating-ui/react';

const OPEN_DELAY_MS = 150;

/** The cue the card is currently anchored to. One state carries the whole
 * interaction: `null` means closed, so open/closed can never disagree with
 * which note is shown. */
interface Anchor {
  el: HTMLElement;
  footnoteId: string;
}

export interface NotePreviewProps {
  /** The editor's rendered shell: `.lexical-footnote__ref` cues and
   * `[data-lexical-footnote-item]` / `[data-lexical-footnote-def]` all
   * live inside it. A delegated listener on this stable element is what
   * survives the extension recreating cue/definition DOM on every
   * commit — cues are never held as a persistent ref, only looked up
   * fresh per hover. */
  shellRef: React.RefObject<HTMLElement | null>;
}

/** Clones `footnoteId`'s live definition into `container`, prefixed with
 * its display number — a read-only snapshot of the note as it stands. */
function cloneNoteInto(
  shell: HTMLElement,
  footnoteId: string,
  container: HTMLElement,
): void {
  const definition = shell.querySelector(
    `[data-lexical-footnote-def="${footnoteId}"]`,
  );
  if (!definition) {
    return;
  }
  const item = shell.querySelector(
    `[data-lexical-footnote-item="${footnoteId}"]`,
  );

  const clone = definition.cloneNode(true) as HTMLElement;
  clone.removeAttribute('contenteditable');
  for (const el of clone.querySelectorAll('[contenteditable]')) {
    el.removeAttribute('contenteditable');
  }

  const numberEl = document.createElement('span');
  numberEl.className = 'pg-popover-n';
  numberEl.textContent =
    item instanceof HTMLLIElement ? String(item.value) : '';
  container.replaceChildren(numberEl, ...Array.from(clone.childNodes));
}

/**
 * Hovering a `.lexical-footnote__ref` cue clones its live note definition
 * into a floating card. Read-only — see this file's header for why.
 */
export function NotePreview({shellRef}: NotePreviewProps) {
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const open = anchor !== null;
  // Mirror for the delegation handlers below, whose effect deliberately
  // doesn't re-bind on every anchor change.
  const anchorRef = useRef<Anchor | null>(null);
  anchorRef.current = anchor;
  const contentRef = useRef<HTMLDivElement>(null);
  const openTimerRef = useRef<number | undefined>(undefined);

  const {refs, floatingStyles, context} = useFloating({
    middleware: [offset(10), flip(), shift({padding: 8})],
    // Only ever *closes* through here (dismiss, or safePolygon deciding
    // the cursor left for good) — opening is the delegation effect's job.
    onOpenChange: isOpen => {
      if (!isOpen) {
        setAnchor(null);
      }
    },
    open,
    // Notes "float up" over their cue by design (see the legend text) —
    // flip() still drops it below when there's no room above.
    placement: 'top',
    whileElementsMounted: autoUpdate,
  });

  // Open/close ownership is split. useHover cannot open for us: its
  // listeners attach to the current reference element, and by the time the
  // delegation below designates one, the pointer is already inside it — no
  // enter event will fire. So opening (and its delay) is the delegation's,
  // while closing stays useHover's: safePolygon defers the close while the
  // cursor's trajectory points at the card and keeps the card itself
  // hoverable, which is what makes it reachable at all.
  const hover = useHover(context, {
    delay: {close: 100},
    handleClose: safePolygon(),
  });
  const dismiss = useDismiss(context);
  const {getFloatingProps} = useInteractions([hover, dismiss]);

  // (Re)clone whenever the anchored note changes — covers both the first
  // open and hovering straight from one cue to the next while already
  // open (anchor changes without `open` ever flipping).
  useEffect(() => {
    const shell = shellRef.current;
    const content = contentRef.current;
    if (anchor && shell && content) {
      cloneNoteInto(shell, anchor.footnoteId, content);
    }
  }, [anchor, shellRef]);

  // Cues are the extension's own DOM, recreated on commits — a delegated
  // listener on the stable shell, not a per-cue one, is what survives
  // that. This only decides *which* element becomes the floating
  // reference and schedules the open; useHover owns everything after.
  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) {
      return;
    }

    function refSpanOf(target: EventTarget | null): HTMLElement | null {
      const span =
        target instanceof Element
          ? target.closest('.lexical-footnote__ref')
          : null;
      return span instanceof HTMLElement ? span : null;
    }

    function onMouseOver(event: MouseEvent) {
      const refSpan = refSpanOf(event.target);
      // The second check drops re-fires from crossing boundaries inside
      // the cue (span → its own button) while its card is already open —
      // restarting the timer would only add churn. It must compare against
      // the *anchor*, not the floating reference: the reference keeps
      // pointing at the span after a dismiss, and skipping on that would
      // make a dismissed card unopenable until the cursor left the cue.
      if (!refSpan || anchorRef.current?.el === refSpan) {
        return;
      }
      const footnoteId = refSpan.getAttribute('data-lexical-footnote-ref');
      if (!footnoteId) {
        return;
      }
      window.clearTimeout(openTimerRef.current);
      openTimerRef.current = window.setTimeout(() => {
        refs.setReference(refSpan);
        setAnchor({el: refSpan, footnoteId});
      }, OPEN_DELAY_MS);
    }

    function onMouseOut(event: MouseEvent) {
      const refSpan = refSpanOf(event.target);
      if (!refSpan) {
        return;
      }
      const related = event.relatedTarget;
      // Moving from the span to its own button is not a real "leave".
      if (related instanceof Node && refSpan.contains(related)) {
        return;
      }
      // Only cancels a pending *open* that hasn't fired yet — closing an
      // already-open card is useHover's job (safePolygon), not this.
      window.clearTimeout(openTimerRef.current);
    }

    shell.addEventListener('mouseover', onMouseOver);
    shell.addEventListener('mouseout', onMouseOut);
    return () => {
      shell.removeEventListener('mouseover', onMouseOver);
      shell.removeEventListener('mouseout', onMouseOut);
      window.clearTimeout(openTimerRef.current);
    };
  }, [shellRef, refs]);

  return (
    // Portaled to the default document.body: vocs's fixed chrome (sidebar,
    // top nav) sits at z-index 10–20 in the root stacking context, and a
    // popover mounted inside the content column is capped below it by
    // ancestor stacking contexts — vocs's own TwoslashHover portals to
    // body with z-index 50 for the same reason. The card's skin (--pg-*
    // tokens) is scoped to `.playground, .pg-note-popover` in the CSS, so
    // it carries its own tokens outside the .playground subtree.
    <FloatingPortal>
      {open && (
        <div
          className="pg-note-popover"
          ref={refs.setFloating}
          role="tooltip"
          style={floatingStyles}
          {...getFloatingProps()}
        >
          <div ref={contentRef} />
        </div>
      )}
    </FloatingPortal>
  );
}
