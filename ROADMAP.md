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
- [ ] Replace whole-document `$dfs` walks where possible: `$nodesOfType`
  for unordered lookups, `$dfsWithSlots` if content moves into slots
  (maintainer feedback — `$dfs` doesn't traverse slot subtrees).

## Editing & interop

- [x] **Paste from Word and Google Docs** — clipboard import rules
  recognize Word's footnote HTML (desktop and web, including Safari's
  sanitized payloads) and Google Docs' exported/published HTML; source
  separators and literal markers are stripped, and pasted notes get fresh
  ids. Requires the `lexical-footnote/clipboard` entry.
- [ ] **Copy/paste between lexical-footnote editors** — copying a ref
  without its section heals an empty definition in the target; carry the
  definition content in the clipboard payload.
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
- [ ] **Named-slot content model** (maintainer suggestion) — attach note
  content to the ref node itself via lexical named slots
  (`$isSlotHost` / `$getSlot`), so content renders anywhere and travels
  with the node on copy/paste. Needs evaluation against GFM's multi-ref
  semantics (one definition, many refs) and the mdast/HTML export story
  (slots serialize only by host opt-in) before replacing the in-document
  section model.
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
