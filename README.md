# lexical-footnote

GFM footnotes for [Lexical](https://lexical.dev), built on the extension
system. Footnote refs, an auto-managed definitions section, in-page
navigation, GFM-compatible HTML export/import, and markdown round-trip via
`@lexical/mdast`.

> **Status: experimental POC.** Built against `lexical@0.47.0` and its
> experimental extension / mdast / DOM-import APIs, which may break between
> releases. Pin your lexical version. See [ROADMAP.md](./ROADMAP.md) for
> what's planned.

## Model

| Node | Kind | Role |
|---|---|---|
| `FootnoteRefNode` | inline `DecoratorTextNode` | the superscript cue — in the body, or inside another note |
| `FootnoteSectionNode` | `ElementNode` | hosts the definitions in named slots, pinned as the last block |
| `FootnoteDefinitionNode` | `ElementNode` | one footnote's flow content |

Design principles:

- **In-document definitions.** Definitions are real nodes (mapping 1:1 to
  mdast `footnoteDefinition`), not an external store — history,
  serialization, and copy/paste come for free.
- **The slot map is the definition map.** GFM keys definitions by
  identifier, and so does the model: each definition is a named slot
  (`fn:<id>`) on the section, not a child of it. "One definition per
  identifier" is therefore structural rather than a transform that has to
  keep cleaning up after the user, and there is no stored order to keep
  correct — so reordering the body no longer mutates the document at all.
  The section itself stays an ordinary root child, which is what keeps it
  reachable by the HTML and mdast exporters.
- **Derived numbering.** Display numbers are never stored. They follow GFM:
  the body's cues first, then whatever the notes themselves cite, in the
  order the notes are read. Exposed as a signal, recomputed each commit.
- **Self-healing invariants** via node transforms: one section, pinned last;
  a dangling cue heals an empty definition; deleting a note deletes its cues;
  orphan definitions are kept (GFM keeps unreferenced definitions).

Each definition renders as an editable island — a slot container inside its
own `<li>` — so a note can be edited in place while remaining structurally
separate from the body: no selection can straddle the boundary between them.

## Usage

```tsx
import {FootnoteExtension} from 'lexical-footnote';
import {LexicalExtensionComposer} from '@lexical/react/LexicalExtensionComposer';
import {defineExtension} from 'lexical';

const appExtension = defineExtension({
  name: 'app',
  namespace: 'app',
  dependencies: [RichTextExtension, FootnoteExtension],
});

<LexicalExtensionComposer extension={appExtension}>…</LexicalExtensionComposer>
```

Insert via command, output API, or by typing — literal `[^id]` in body
text materializes a cue and heals an empty definition (skipped inside
code-formatted text):

```ts
editor.dispatchCommand(INSERT_FOOTNOTE_COMMAND, undefined);
// or
const {insertFootnote, gotoDefinition, gotoRef, cleanupOrphans, numbers} =
  getExtensionDependencyFromEditor(editor, FootnoteExtension).output;

gotoRef(id); // a note cited more than once: gotoRef(id, 2) for its 2nd cue
```

`numbers` is a signal of `Map<footnoteId, number>` — the displayed numbering,
derived from cue order on every commit and never stored on a node.

### Markdown (optional)

```ts
import {FootnoteMdastExtension} from 'lexical-footnote/mdast';
// add alongside MdastCommonMarkExtension / MdastExportExtension
```

`[^id]` / `[^id]: …` round-trips through `@lexical/mdast`
(micromark-extension-gfm-footnote under the hood). Definitions declared
anywhere in the source are normalized into the section.

### Clipboard (optional)

```ts
import {FootnoteClipboardExtension} from 'lexical-footnote/clipboard';
```

Lexical's default paste path uses the legacy static-importDOM converter and
never consults rule-based import. This extension routes `text/html` pastes
through the DOMImportExtension pipeline, so pasting footnote-bearing HTML
produces real footnotes. Opt-in because it reroutes all HTML pastes for
the editor, not just footnote content.

Recognized sources (verified in Chrome, Firefox, and Safari):

- **Word** — desktop and web copies, including Safari's sanitized clipboard
  (absolute `applewebdata:` hrefs, stripped `mso-*` styles)
- **Google Docs** — HTML the app exports or publishes (File → Download →
  Web Page, or a published page). Copying inside the Docs editor doesn't
  put definitions on the clipboard — a Docs limitation — so such pastes
  produce cues with empty, editable notes
- **GitHub**'s rendered GFM output and this package's own `exportDOM`

Source chrome (separator rules, literal `[1]` markers, backref anchors) is
stripped, and pasted footnotes get fresh ids so a paste can't collide with
or merge into notes already in the document.

### HTML

`exportDOM` mirrors GitHub's footnote HTML — `<sup><a data-footnote-ref
href="#fn-id" id="fnref-id">` cues and a `<section
data-footnotes><ol><li id="fn-id">` block with `data-footnote-backref`
links — so exported documents have working anchors on static pages. Import
rules accept both this output and GitHub's `user-content-` prefixed HTML.

A note cited more than once gets a backref per cue: repeat cues are
suffixed (`fnref-id-2`), and the second backref onwards shows its index
(`↩`, `↩²`). The section opens with a visually-hidden
`<h2 id="footnote-label">`, which every cue's `aria-describedby` points at.

One deliberate difference from GitHub: a definition nothing refers to is
still exported. This is a document editor, so an orphan note is content
someone wrote and dropping it would be silent data loss. If your HTML is a
rendering rather than a document, opt into GitHub's behavior:

```ts
configExtension(FootnoteExtension, {dropOrphansOnExport: true});
```

Markdown export is unaffected either way — GFM permits an orphan definition
in the source, and only its HTML rendering discards it.

## Behavior notes

- Inserting a footnote keeps selected text and places the marker after the
  selection (Word/tiptap semantics), then moves the caret into the new
  definition.
- Deleting a cue keeps its definition as an orphan: the deletion stays
  recoverable, and a cut cue can be pasted back onto its note. Call
  `cleanupOrphans()` (output API) or `$cleanupOrphanFootnotes()` to
  permanently discard unreferenced definitions — it returns `true` when
  anything was removed. Use `$removeFootnote(id)` to remove cues and
  definition together.
- Deleting a definition deletes its cues in the same update (undo restores
  both) — deleting the definition means deleting the footnote. Emptying a
  note and deleting again is how you delete one from the keyboard; a
  definition is a slot value, so no caret in the body can reach it. Cues
  that become dangling some other way (e.g. pasted markers) heal an empty
  definition, so references without content always render as numbered
  entries.
- Emptying the whole document removes the notes section with it — notes
  annotate a document, and there is no longer one. A document that merely
  *arrives* with no cues (an import of nothing but definitions) is left
  alone.
- Backspace/delete at a cue boundary selects the cue first instead of
  deleting it outright (Word/Notion behavior); a second delete removes it.
- Multiple refs to one id are valid (GFM) and share a number, and the note
  gets a backref per cue. This differs from tiptap/Word, which duplicate the
  footnote on paste — GFM semantics keep markdown round-trip exact.
- A note may cite another note. Numbering follows GFM: the body first, then
  whatever the notes cite, in the order the notes are read — so a note
  reachable only from inside another one is numbered right after it. Cycles
  and self-citation terminate.
- Arrow keys move between notes. The extension does this itself in every
  browser: each note is an editable island, and Firefox will not carry the
  caret across one.
- The definitions section is pinned to the end of the document; content
  typed after it is moved above it.

## vs. tiptap Pages footnotes

[tiptap Pages footnotes](https://tiptap.dev/docs/pages/core-concepts/footnotes)
render per **page**, above the page footer — a feature of their pagination
engine, with footnote content stored outside the document and edited in a
separate scoped editor. Lexical has no page/header/footer concept, so that
placement is not reproducible; a continuous document collects notes at the
end, which tiptap itself calls
[endnotes](https://tiptap.dev/docs/pages/core-concepts/endnotes). This
package is the endnotes/GFM shape with the same behavioral guarantees:
computed continuous numbering (never stored), insert-after-selection,
click-to-scroll navigation, undo-safe orphan retention with an explicit
cleanup command, and empty notes that render and heal.

## Development

```bash
pnpm install
pnpm dev        # vite demo
pnpm test       # vitest
pnpm build      # tsdown
```

## License

MIT
