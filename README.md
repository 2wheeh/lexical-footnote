# lexical-footnote

GFM footnotes for [Lexical](https://lexical.dev): superscript cues, an
auto-managed notes section, in-page navigation, GitHub-compatible HTML
export/import, and exact markdown round-trip via `@lexical/mdast`.

> **Beta.** Built on `lexical@0.47`'s experimental extension APIs — pin your
> lexical version.

```sh
pnpm add lexical-footnote
```

```tsx
import {FootnoteExtension} from 'lexical-footnote';
import {LexicalExtensionComposer} from '@lexical/react/LexicalExtensionComposer';
import {RichTextExtension} from '@lexical/rich-text';
import {defineExtension} from 'lexical';

const appExtension = defineExtension({
  name: 'app',
  namespace: 'app',
  dependencies: [RichTextExtension, FootnoteExtension],
});

<LexicalExtensionComposer extension={appExtension}>…</LexicalExtensionComposer>;
```

[Documentation](https://lexical-footnote.vercel.app) ·
[Playground](https://lexical-footnote.vercel.app/playground)

- **[`package/`](./package)** — the [`lexical-footnote`](https://www.npmjs.com/package/lexical-footnote) npm package
- **[`docs/`](./docs)** — the documentation site ([vocs](https://vocs.dev))
- **[ROADMAP.md](./ROADMAP.md)**

## License

MIT
