# Roadmap

Experimental POC tracking `lexical@0.47.x`. Nothing here is a commitment —
if something matters to you, open an issue so it gets prioritized.

## Customization & API

- [ ] **Customizable backref / cue rendering** — expose marker content
  (`↩`, numbers), theme keys, and a render override; the backref overlay is
  hardcoded today.
- [ ] **Package-provided stylesheet** — visuals live in the demo's CSS;
  ship `lexical-footnote/styles.css` so it looks right out of the box.
- [ ] **Framework-agnostic cue** — `decorate()` returns React; investigate a
  vanilla path.

## Editing & interop

- [ ] **Carry the definition in the clipboard** — a cue pasted without its
  section heals an *empty* note, so cut-and-paste moves the cue but not the
  text. The fix is putting definitions in the clipboard payload.
- [ ] Markdown export id normalization — `[^k3j9x2m1]` → sequential `[^1]`,
  preserving authored labels.
- [ ] Plain-text copy of a cue exposes the raw id — derive something readable.
- [ ] Rich note content (lists, code blocks) — exercise HTML/mdast round-trips.

## Collaboration & presentation

- [ ] **Yjs / collab verification** — numbering convergence and transform
  behavior across clients.
- [ ] **Floating note editor / mirror view** — notes are already editable
  islands mountable outside the editor; build the presentation on top.
- [ ] Read-only mode (`editable: false`) with click-to-jump intact.
- [ ] Reposition the backref overlay on non-editor layout changes
  (`ResizeObserver`).

## Quality & docs

- [ ] Docs site with working examples, evolved from the demo deployment.
- [ ] Screen-reader pass (VoiceOver) — the exported HTML carries GFM's a11y
  contract, but no screen reader has read it yet.
- [ ] Extend the browser test project beyond the caret: click-to-jump,
  backref focus, paste. Run it in CI, with `publint`/`attw`.
- [ ] Export walks the document once per footnote node — fine at document
  scale; revisit if it bites.

## Upstream

- [ ] Footnote support for the **mdast-editor example**
  ([discussion #5432](https://github.com/facebook/lexical/discussions/5432)).
- [ ] Report findings: root-hosted slots don't reach the exporters
  (`spike/rootSlot.test.ts`), `mountSlotContainer` vs the
  `$getSlotTargetElement` render override, `canBeEmpty()` on non-editable
  slot hosts, Firefox caret at slot-island boundaries.

## Done (0.2.0)

Definitions became named slots on the section — the slot map *is* the GFM
definition map (see README "Model"). With it: per-cue backrefs and ids,
nested footnotes with GFM's numbering, a deletion policy codified in tests,
paste from Word / Google Docs / GitHub, a cross-browser caret spec
(Chromium/Firefox/WebKit), and the `model/` / `ui/` / `io/` split. History
has the reasoning: `git log v0.1.4..v0.2.0`.
