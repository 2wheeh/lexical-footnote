import type {ReactNode} from 'react';

import './landing.css';

/**
 * Static hero styled as the footnote anatomy itself: title with a cue,
 * short rule, the tagline as note 1, backref included. Anchors only —
 * no client JS. `children` slots the vocs HomePage install/buttons in
 * between.
 */
export function Landing({children}: {children?: ReactNode}) {
  return (
    <div className="landing">
      <h1 className="landing-title">
        lexical-footnote
        <sup>
          <a
            href="#tagline"
            id="tagline-ref"
            aria-describedby="tagline"
            aria-label="Footnote 1"
          >
            1
          </a>
        </sup>
      </h1>

      <div className="landing-actions">{children}</div>

      <hr className="landing-rule" aria-hidden="true" />
      <p className="landing-note" id="tagline">
        <span className="landing-note-num">1.</span>
        GFM footnotes for Lexical — cues, notes, in-page links, and markdown
        round-trip.
        <a
          className="landing-backref"
          href="#tagline-ref"
          aria-label="Back to reference 1"
        >
          ↩
        </a>
      </p>
    </div>
  );
}
