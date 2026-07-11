# lexical-footnote

GFM footnotes for [Lexical](https://lexical.dev): superscript cues, an
auto-managed notes section, in-page navigation, GitHub-compatible HTML
export/import, and exact markdown round-trip via `@lexical/mdast`.

> **Status: beta, actively developed.** Built on `lexical@0.47.0`'s
> experimental extension / mdast / DOM-import / named-slot APIs, which may
> break between releases — pin your lexical version.
> [ROADMAP.md](./ROADMAP.md) has what's planned.

## Model

| Node | Kind | Role |
|---|---|---|
| `FootnoteRefNode` | inline `DecoratorTextNode` | a cue — in the body, or inside another note |
| `FootnoteSectionNode` | `ElementNode`, last root child | hosts the definitions in named slots |
| `FootnoteDefinitionNode` | `ElementNode`, slot value | one note's flow content |

- **The slot map is the definition map.** GFM keys definitions by identifier;
  so does the model — each definition is a named slot (`fn:<id>`) on the
  section. "One definition per identifier" is structural, there is no stored
  order to maintain, and reordering the body never mutates the document.
- **Derived numbering.** Numbers follow GFM — body cues first, then whatever
  the notes themselves cite — recomputed each commit, exposed as a signal,
  never stored on a node.
- **Editable islands.** Each note renders in its own `contentEditable`
  container: editable in place, structurally isolated from the body.
- **Self-healing.** A dangling cue heals an empty definition; one section,
  pinned last; orphan definitions are kept (legal in GFM).

Because definitions are slot values, they don't appear in
`section.getChildren()` and `definition.remove()` doesn't detach them — use
`$getFootnoteDefinitions()` / `$removeFootnoteDefinition(id)`.

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

Insert via command, output API, or by typing — a literal `[^id]` in body text
becomes a cue and heals its definition (skipped in code-formatted text):

```ts
editor.dispatchCommand(INSERT_FOOTNOTE_COMMAND, undefined);
// or
const {insertFootnote, gotoDefinition, gotoRef, cleanupOrphans, numbers} =
  getExtensionDependencyFromEditor(editor, FootnoteExtension).output;

gotoRef(id);    // a note cited more than once: gotoRef(id, 2) for its 2nd cue
// `numbers` is a signal of Map<footnoteId, number> — the displayed numbering
```

### Markdown (optional)

```ts
import {FootnoteMdastExtension} from 'lexical-footnote/mdast';
// add alongside MdastCommonMarkExtension / MdastExportExtension
```

`[^id]` / `[^id]: …` round-trips through `@lexical/mdast`. Definitions
declared anywhere in the source are normalized into the section.

### Clipboard (optional)

```ts
import {FootnoteClipboardExtension} from 'lexical-footnote/clipboard';
```

Routes `text/html` pastes through rule-based import (the default paste path
never consults it), so footnote-bearing HTML pastes as real footnotes.
Recognized and verified in Chrome, Firefox, and Safari:

- **Word** — desktop and web, including Safari's sanitized clipboard
- **Google Docs** — exported/published HTML (in-editor copies don't carry
  definitions — a Docs limitation — and paste as cues with empty notes)
- **GitHub**'s rendered GFM, and this package's own `exportDOM`

Source chrome (separators, literal markers, backrefs) is stripped; pasted
footnotes get fresh ids so a paste can't merge into existing notes.

### HTML

`exportDOM` emits GitHub's exact shape: `<sup><a data-footnote-ref
id="fnref-id">` cues (repeat cues suffixed `fnref-id-2`), a
`<section data-footnotes>` with a visually-hidden `footnote-label` heading,
and one `data-footnote-backref` link per cue (`↩`, `↩²`). Import accepts both
this output and GitHub's `user-content-` prefixed variant.

One deliberate difference: definitions nothing refers to are still exported —
this is a document format, and an orphan note is content someone wrote. If
your HTML is a rendering rather than a document, opt into GitHub's behavior
(markdown export is unaffected either way):

```ts
configExtension(FootnoteExtension, {dropOrphansOnExport: true});
```

## Behavior notes

- Inserting keeps selected text, places the cue after it, and moves the caret
  into the new note (Word/tiptap semantics).
- Deleting a cue keeps its note as a recoverable orphan; `cleanupOrphans()`
  discards orphans permanently. Deleting a note deletes its cues in the same
  update (one undo restores both). Emptying a note and deleting again removes
  it — the keyboard route to note deletion. Emptying the whole document
  removes the section too.
- Backspace at a cue boundary selects the cue first; a second delete removes
  it.
- Many cues may share one id (GFM): they share a number, and the note gets a
  backref per cue. A note may cite another note — it's numbered right after
  the note that cites it; cycles and self-citation terminate.
- Arrow keys move between notes in every browser. Each note is an editable
  island, and Firefox won't carry the caret across one on its own.

## vs. tiptap Pages footnotes

tiptap renders footnotes per **page** — a feature of its pagination engine,
with content stored outside the document. Lexical has no page concept; a
continuous document collects notes at the end, which tiptap calls
[endnotes](https://tiptap.dev/docs/pages/core-concepts/endnotes). This package
is that shape with GFM semantics and in-document definitions.

## Development

```bash
pnpm install
pnpm dev            # vite demo
pnpm test           # headless (happy-dom): model, import/export
pnpm test:browser   # Chromium, Firefox, WebKit: caret behavior
pnpm build          # tsdown
```

The source splits along the same line as the tests: `model/` is the rules
(headless, no DOM), `ui/` needs a real browser, `io/` is the contracts with
other formats, `spike/` pins the upstream slot APIs this package relies on.

## License

MIT
