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
- [x] Extract the overlay/keyboard UI out of `FootnoteExtension.register` —
  the source now splits into `model/` (the rules: headless, no DOM), `ui/`
  (list items, backref overlay, keyboard) and `io/` (the HTML contracts and
  importers), with the extension itself reduced to wiring. That line is where
  the Firefox caret bug lived, and it is the line the two test projects run
  along.
- [x] Replace whole-document `$dfs` walks where possible: unordered lookups
  read the node map (`$nodesOfType`), and the order-sensitive ones share a
  single walk (`$collectFootnoteRefs`) instead of one per note per commit.
  Not `$dfsWithSlots`: it visits slot subtrees in slot-map order — the
  code-unit order of the ids — which has nothing to do with reference order.
  The body is walked first, then the notes deliberately, in the order GFM
  numbers them.
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
- [x] **Nested footnotes** (a cue inside a note) — numbering follows GFM's
  growing loop: the body first, then whatever the notes cite, in the order the
  notes are read, so a note reachable only from inside another is numbered
  right after it. Cycles and self-citation terminate. Cues inside *orphan*
  notes are numbered too, which GitHub never has to do (it drops orphans);
  we keep them, and a visible note whose cue rendered as `?` would look broken.
- [ ] Rich definition content (lists, code blocks) — exercise HTML/mdast
  round-trips.

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
- [x] Cross-browser verification for caret and overlay interactions —
  `pnpm test:browser` runs the caret specs in Chromium, Firefox and WebKit
  (vitest browser mode, playwright provider). This is where the Firefox bug
  surfaced: each note is an editable island, and Firefox will not carry the
  caret across one, so moving between notes is the extension's job in every
  browser. happy-dom has no caret and could never have caught it. Paste flows
  were already verified across the three engines by hand.
- [ ] A real screen-reader pass (VoiceOver). The exported HTML now carries
  GFM's own a11y contract (`aria-describedby` on every cue, a visually-hidden
  `footnote-label` heading, labelled backrefs), but it has been read by no
  screen reader yet.
- [ ] Extend the browser project beyond the caret: click-to-jump, backref
  focus flows, paste. Only the caret specs run there today.
- [ ] Package lint in CI (`publint`, `attw`), `prepublishOnly` guard. No CI
  runs the browser project yet either.

## Upstream

- [ ] Footnote support for the upstream **mdast-editor example** — the
  maintainer suggested this as the right home (it's on his list, and the
  playground doesn't use mdast yet). See
  [discussion #5432](https://github.com/facebook/lexical/discussions/5432).
- [ ] Report upstream findings from building this: mutation-listener
  behavior in headless environments, `DOMExportOutput.after` return-value
  semantics, NodeCaret typing around `TextPointCaret`.
