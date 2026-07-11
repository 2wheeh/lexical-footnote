# Roadmap

Status: experimental POC, tracking `lexical@0.47.x`. Items are roughly
ordered within each group; nothing here is a commitment. Issues and PRs
welcome — if something below matters to you, open an issue so it gets
prioritized.

## Customization & API

- [ ] **Customizable backref / cue rendering** — expose the marker content
  (`↩`, numbers), theme keys, and a render override so consumers aren't
  locked to the defaults. The backref overlay is currently hardcoded.
- [ ] **Package-provided stylesheet** — cue/backref/section visuals live in
  the demo's CSS today; ship a default stylesheet (`lexical-footnote/styles.css`)
  so the extension looks right out of the box.
- [ ] **Framework-agnostic cue** — `decorate()` currently returns React.
  Investigate a vanilla rendering path so non-React consumers can use the
  extension.
- [ ] Extract the overlay/keyboard UI out of `FootnoteExtension.register`
  into its own module (internal refactor, no behavior change).
- [x] Replace whole-document `$dfs` walks where possible: unordered lookups
  read the node map (`$nodesOfType`), and the order-sensitive ones now share
  a single walk (`$collectFootnoteRefs`). `$dfs` not traversing slot subtrees
  is what makes it exactly a walk of the body — cues live there, definitions
  are slot values — so it is the right tool here rather than `$dfsWithSlots`.
- [ ] Export walks the document once per footnote node (`exportDOM` has no
  shared context to hang a cache on, and caching by editor-state identity
  goes stale inside an update). Fine at document scale; revisit if it bites.

## Editing & interop

- [x] **Paste from Word and Google Docs** — clipboard import rules
  recognize Word's footnote HTML (desktop and web, including Safari's
  sanitized payloads) and Google Docs' exported/published HTML; source
  separators and literal markers are stripped, and pasted notes get fresh
  ids. Requires the `lexical-footnote/clipboard` entry.
- [ ] **Carry the definition in the clipboard** — a cue copied without its
  section heals an *empty* definition in the target, and cutting a cue now
  deletes its note (deletion propagates), so cut-and-paste loses the note's
  text rather than moving it. A single undo restores it, but the fix is to
  put the definition in the clipboard payload.
- [ ] **Markdown export identifier normalization** — generated ids export as
  `[^k3j9x2m1]`; normalize to `[^1]`-style sequential identifiers while
  preserving authored labels.
- [ ] Plain-text copy of a cue exposes the raw id — derive something
  readable.
- [ ] Nested footnotes (refs inside definitions) and rich definition content
  (lists, code blocks) — exercise HTML/mdast round-trips. Note that a cue
  inside a note is invisible to the numbering walk today: definitions are
  slot values, and `$dfs` does not descend into slots.

## Collaboration & presentation

- [ ] **Yjs / collab verification** — the in-document model should work
  under `@lexical/yjs` in principle (definitions are ordinary nodes);
  verify numbering convergence and transform behavior across clients.
- [x] **Named-slot content model** (maintainer suggestion) — landed, but
  hosted on the *section*, not on the cue: GFM keys definitions by
  identifier, so one note can have many cues, and a cue-hosted slot has no
  answer for which cue owns the content. Each definition is a slot
  (`fn:<id>`) on the section — the slot map IS the definition map — which
  makes "one definition per identifier" structural and leaves display order
  to be derived. The section stays an ordinary root child because slots on
  the *root* are invisible to both exporters (`$generateDOMFromNodes` walks
  `root.getChildren()`; `@lexical/mdast` has no slot awareness), so notes
  hosted there would silently vanish from HTML and markdown.
- [ ] **Document-separated presentation layer** — floating footnote editor
  (edit a definition in a popup anchored at its cue, tiptap-style) and an
  optional mirror view for rendering the notes outside the editor, without
  changing the in-document data model. (Subsumed by the named-slot model
  if that lands.)
- [ ] Read-only (`editable: false`) mode — keep click-to-jump navigation
  working.
- [ ] Reposition backref overlay on non-editor layout changes (fonts,
  images) via `ResizeObserver`.

## Quality & docs

- [ ] **Docs site with working examples** — evolve the demo deployment into
  interactive documentation (usage, recipes, live playground).
- [ ] Cross-browser verification (Firefox, Safari) for caret and overlay
  interactions — paste flows are already verified across Chrome, Firefox,
  and Safari — and a real screen-reader pass (VoiceOver).
- [ ] Playwright e2e coverage for the keyboard/mouse flows that unit tests
  can't reach.
- [ ] Package lint in CI (`publint`, `attw`), `prepublishOnly` guard.

## Upstream

- [ ] Footnote support for the upstream **mdast-editor example** — the
  maintainer suggested this as the right home (it's on his list, and the
  playground doesn't use mdast yet). See
  [discussion #5432](https://github.com/facebook/lexical/discussions/5432).
- [ ] Report upstream findings from building this: mutation-listener
  behavior in headless environments, `DOMExportOutput.after` return-value
  semantics, NodeCaret typing around `TextPointCaret`.
