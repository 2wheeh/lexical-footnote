# lexical-footnote

## 0.3.2

### Patch Changes

- [#5](https://github.com/2wheeh/lexical-footnote/pull/5) [`1ba7864`](https://github.com/2wheeh/lexical-footnote/commit/1ba7864d59ceda7af6d042712ed8d7c858d10c8e) Thanks [@2wheeh](https://github.com/2wheeh)! - Fix markdown (mdast) round-trip losing text format on footnote cues. Import now applies the surrounding emphasis/strong/delete context to the cue's format bitmask, and export re-wraps the cue per its format bits (emphasis innermost, matching core text serialization). A contributed to-markdown root handler folds adjacent same-type phrasing wrappers back together before serialization, so a formatted cue merges with neighboring same-format text (`**x[^a]**`) instead of serializing as the non-re-parseable `**x****[^a]**`.

## 0.3.1

### Patch Changes

- [#3](https://github.com/2wheeh/lexical-footnote/pull/3) [`c0185f5`](https://github.com/2wheeh/lexical-footnote/commit/c0185f5a1e001503ac8f0c4109c59c6754dac03c) Thanks [@2wheeh](https://github.com/2wheeh)! - Expose `./package.json` in the exports map so tooling (docs sites, bundlers, `require.resolve`) can read package metadata.

## 0.3.0

### Minor Changes

- [`ef04d09`](https://github.com/2wheeh/lexical-footnote/commit/ef04d09efff4b921c699412937944c119eba8dda) Thanks [@2wheeh](https://github.com/2wheeh)! - Copy now carries the notes a selection references — appended to `text/html`
  as a GFM footnote section and to the Lexical JSON payload — so a cue pasted
  elsewhere brings its text along. Paste re-keys a carried footnote whose id
  names a different note in the target document, so a paste can never
  overwrite an existing note; same-content pastes keep their id, so
  cut-and-paste reconnects and multiple cues keep sharing one note.

- [#1](https://github.com/2wheeh/lexical-footnote/pull/1) [`9f098f6`](https://github.com/2wheeh/lexical-footnote/commit/9f098f6412ea77ae7aa6b094518efc6ef60d1803) Thanks [@2wheeh](https://github.com/2wheeh)! - The package now ships a default stylesheet, `lexical-footnote/styles.css` —
  the out-of-the-box look for the footnote anatomy (superscript cues, the
  short separator rule, the numbered notes list, `↩` backrefs). Host-agnostic:
  it inherits the host's typography and colors, sizes in `em`, and works on
  any light or dark background with zero configuration. Themeable via
  optional `--lexical-footnote-*` custom properties (accent,
  accent-contrast, note-color, rule-color); styling the class names yourself
  without the stylesheet remains fully supported.

### Patch Changes

- [#1](https://github.com/2wheeh/lexical-footnote/pull/1) [`b7a288e`](https://github.com/2wheeh/lexical-footnote/commit/b7a288e3ec048c1de663036eaf34efc0ad4f5ef8) Thanks [@2wheeh](https://github.com/2wheeh)! - Fixed an unrecoverable editor state: deleting the whole body when footnotes
  existed (e.g. select-all + backspace, which removes the last paragraph as a
  block) could leave the footnote section as the root's only child — a
  non-editable shell with no caret position anywhere, so typing became
  impossible. The root transform now guarantees a body paragraph next to the
  section and restores the caret when the deletion left it pointing at
  removed nodes; the empty-body policy then converges to the same end state
  as an ordinary select-all delete (section discarded, one undo restores
  everything).
