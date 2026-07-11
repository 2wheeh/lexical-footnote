# lexical-footnote

GFM footnotes for [Lexical](https://lexical.dev), built on the extension
system. Footnote refs, an auto-managed definitions section, in-page
navigation, GFM-compatible HTML export/import, and markdown round-trip via
`@lexical/mdast`.

> **Status: experimental POC.** Built against `lexical@0.47.0` and its
> experimental extension / mdast / DOM-import APIs, which may break between
> releases. Pin your lexical version.

## Model

| Node | Kind | Role |
|---|---|---|
| `FootnoteRefNode` | inline `DecoratorTextNode` | the superscript cue in the body |
| `FootnoteSectionNode` | `ElementNode` | definitions container, pinned as the last block |
| `FootnoteDefinitionNode` | `ElementNode` | one footnote's flow content |

Design principles:

- **In-document definitions.** Definitions are real nodes at the end of the
  document (mapping 1:1 to mdast `footnoteDefinition`), not an external
  store — history, serialization, and copy/paste come for free.
- **Derived numbering.** Display numbers are never stored. They're computed
  from the document order of first references (GFM numbering) and exposed as
  a signal; reordering refs renumbers cues reactively without touching the
  document.
- **Self-healing invariants** via node transforms: one section, pinned last;
  definitions live in the section, ordered by reference order, deduped by
  id; a dangling ref heals an empty definition; orphan definitions are kept
  (GFM keeps unreferenced definitions).

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

Insert via command or output API:

```ts
editor.dispatchCommand(INSERT_FOOTNOTE_COMMAND, undefined);
// or
const {insertFootnote, gotoDefinition, gotoRef, numbers} =
  getExtensionDependencyFromEditor(editor, FootnoteExtension).output;
```

### Markdown (optional)

```ts
import {FootnoteMdastExtension} from 'lexical-footnote/mdast';
// add alongside MdastCommonMarkExtension / MdastExportExtension
```

`[^id]` / `[^id]: …` round-trips through `@lexical/mdast`
(micromark-extension-gfm-footnote under the hood). Definitions declared
anywhere in the source are normalized into the section.

### HTML

`exportDOM` mirrors GitHub's footnote HTML — `<sup><a data-footnote-ref
href="#fn-id" id="fnref-id">` cues and a `<section
data-footnotes><ol><li id="fn-id">` block with `data-footnote-backref`
links — so exported documents have working anchors on static pages. Import
rules accept both this output and GitHub's `user-content-` prefixed HTML.

## Behavior notes

- Inserting a footnote keeps selected text and places the marker after the
  selection (Word/tiptap semantics), then moves the caret into the new
  definition.
- Deleting a ref keeps its definition as an orphan so a plain undo restores
  everything; call `cleanupOrphans()` (output API) or
  `$cleanupOrphanFootnotes()` to permanently discard unreferenced
  definitions — it returns `true` when anything was removed. Use
  `$removeFootnote(id)` to remove refs and definition together.
- Deleting a definition leaves its refs dangling; a dangling ref heals an
  empty definition when next modified (references without content always
  render as numbered entries).
- Multiple refs to one id are valid (GFM) and share a number. This differs
  from tiptap/Word, which duplicate the footnote on paste — GFM semantics
  keep markdown round-trip exact.
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
