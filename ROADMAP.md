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

## Editing & interop

- [ ] **Cross-document copy/paste** — pasting a ref into another editor
  currently heals an empty definition; carry the definition content along
  (clipboard payload policy).
- [ ] **Markdown export identifier normalization** — generated ids export as
  `[^k3j9x2m1]`; normalize to `[^1]`-style sequential identifiers while
  preserving authored labels.
- [ ] Plain-text copy of a cue exposes the raw id — derive something
  readable.
- [ ] Nested footnotes (refs inside definitions) and rich definition content
  (lists, code blocks) — exercise HTML/mdast round-trips.

## Collaboration & presentation

- [ ] **Yjs / collab verification** — the in-document model should work
  under `@lexical/yjs` in principle (definitions are ordinary nodes);
  verify numbering convergence and transform behavior across clients.
- [ ] **Document-separated presentation layer** — floating footnote editor
  (edit a definition in a popup anchored at its cue, tiptap-style) and an
  optional mirror view for rendering the notes outside the editor, without
  changing the in-document data model.
- [ ] Read-only (`editable: false`) mode — keep click-to-jump navigation
  working.
- [ ] Reposition backref overlay on non-editor layout changes (fonts,
  images) via `ResizeObserver`.

## Quality & docs

- [ ] **Docs site with working examples** — evolve the demo deployment into
  interactive documentation (usage, recipes, live playground).
- [ ] Cross-browser verification (Firefox, Safari) and a real screen-reader
  pass (VoiceOver).
- [ ] Playwright e2e coverage for the keyboard/mouse flows that unit tests
  can't reach.
- [ ] Package lint in CI (`publint`, `attw`), `prepublishOnly` guard.

## Upstream

- [ ] Minimal playground-shaped version to PR against
  [facebook/lexical](https://github.com/facebook/lexical) if there's
  interest (see
  [discussion #5432](https://github.com/facebook/lexical/discussions/5432)).
- [ ] Report upstream findings from building this: mutation-listener
  behavior in headless environments, `DOMExportOutput.after` return-value
  semantics, NodeCaret typing around `TextPointCaret`.
