# Roadmap

Beta, tracking `lexical@0.47.x`. Nothing here is a commitment — if something
matters to you, open an issue so it gets prioritized.

## Customization & API

- [ ] **Customizable backref / cue rendering** — expose marker content
      (`↩`, numbers), theme keys, and a render override; the backref overlay is
      hardcoded today.
- [ ] **Framework-agnostic cue** — `decorate()` returns React; investigate a
      vanilla path.

## Editing & interop

- [ ] Markdown export id normalization — `[^k3j9x2m1]` → sequential `[^1]`,
      preserving authored labels.
- [ ] Plain-text copy of a cue exposes the raw id — derive something readable.
- [ ] Rich note content (lists, code blocks) — exercise HTML/mdast round-trips.

## Collaboration & presentation

- [ ] **Yjs / collab verification** — numbering convergence and transform
      behavior across clients.
- [ ] **Floating note editor / mirror view** — a read-only hover preview
      ships in the docs playground (`docs/src/components/notePreview.tsx`),
      shaped for promotion. Making the floating note _editable_ is blocked
      upstream: input events bind to `editor.getRootElement()` only, while
      the reconciler removes untracked DOM anywhere inside that root's
      subtree on the next commit — no location satisfies both. Needs a
      Lexical hook such as registering an additional event-root overlay
      (generalizing the backref-overlay pattern) or a portal contract in
      `$getSlotTargetElement`.
- [ ] Read-only mode (`editable: false`) with click-to-jump intact.
- [ ] Reposition the backref overlay on non-editor layout changes
      (`ResizeObserver`).

## Quality & docs

- [ ] Docs site with working examples, evolved from the demo deployment.
- [ ] Screen-reader pass (VoiceOver) — the exported HTML carries GFM's a11y
      contract, but no screen reader has read it yet.
- [ ] Extend the browser test project beyond the caret: click-to-jump,
      backref focus, real-clipboard copy/paste (the carry behavior is
      headless-verified only). Run it in CI, with `publint`/`attw`.
- [ ] Export walks the document once per footnote node — fine at document
      scale; revisit if it bites.

## Upstream

- [ ] Footnote support for the **mdast-editor example**
      ([discussion #5432](https://github.com/facebook/lexical/discussions/5432)).
- [ ] Report findings: root-hosted slots don't reach the exporters
      (`spike/rootSlot.test.ts`), `mountSlotContainer` vs the
      `$getSlotTargetElement` render override, `canBeEmpty()` on non-editable
      slot hosts, Firefox caret at slot-island boundaries, and the
      editable-floating-island blocker (events bind to the root element ×
      reconciler sweeps untracked DOM in its subtree).

## Done

Since 0.2.1: copy carries the notes a selection references (`text/html` and
Lexical JSON payloads), and paste re-keys a carried footnote whose id names
a different note in the target document — cut-and-paste moves the text, and
a paste can't overwrite an existing note (see README "Clipboard"). The
package now ships a default stylesheet — `lexical-footnote/styles.css`,
themeable via `--lexical-footnote-*` tokens (see README "Styling") — and
the docs playground was rebuilt on it.

In 0.2.0, definitions became named slots on the section — the slot map _is_
the GFM definition map (see README "Model"). With it: per-cue backrefs and
ids, nested footnotes with GFM's numbering, a deletion policy codified in
tests, paste from Word / Google Docs / GitHub, a cross-browser caret spec
(Chromium/Firefox/WebKit), and the `model/` / `ui/` / `io/` split. History
has the reasoning: `git log v0.1.4..v0.2.0`.
