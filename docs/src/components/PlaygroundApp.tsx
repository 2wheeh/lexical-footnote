'use client';

import {useEffect, useState} from 'react';

import {AutoFocusExtension} from '@lexical/extension';
import {HistoryExtension} from '@lexical/history';
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
  MdastCommonMarkExtension,
  MdastExportExtension,
  MdastGfmExtension,
  MdastShortcutsExtension,
} from '@lexical/mdast';
import {LexicalExtensionComposer} from '@lexical/react/LexicalExtensionComposer';
import {TreeViewExtension} from '@lexical/react/TreeViewExtension';
import {ExtensionComponent} from '@lexical/react/ExtensionComponent';
import {useExtensionDependency} from '@lexical/react/useExtensionComponent';
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {RichTextExtension} from '@lexical/rich-text';
import {configExtension, defineExtension} from 'lexical';

import {$isFootnoteRefNode, FootnoteExtension} from 'lexical-footnote';
import {FootnoteClipboardExtension} from 'lexical-footnote/clipboard';
import {FootnoteMdastExtension} from 'lexical-footnote/mdast';

import './playground.css';

const SAMPLE = `# lexical-footnote

A **GFM footnote** extension for [Lexical](https://lexical.dev), built on
\`@lexical/extension\` and \`@lexical/mdast\`[^mdast].

## Why footnotes?

- Definitions live *in the document* — markdown round-trips exactly[^model]
- Numbers are computed from reference order, never stored
- ~~External store~~ No sync machinery: history and copy/paste come free

> Try it: type \`[^note]\` anywhere, or markdown like \`# \`, \`**bold**\`,
> \`- \` lists — shortcuts materialize as you type.

[^mdast]: The first external consumer of the experimental mdast pipeline.

[^model]: One definition per identifier, ordered by first reference (GFM).
`;

const appExtension = defineExtension({
  dependencies: [
    RichTextExtension,
    AutoFocusExtension,
    HistoryExtension,
    // The tree prints NodeState for TextNode and LinkNode only, so a cue
    // shows up as a bare `footnote-ref` — which id it points at, the thing
    // you actually want to see next to the definition's `[slot: fn:<id>]`,
    // is invisible. customPrintNode is the sanctioned way to add it.
    configExtension(TreeViewExtension, {
      customPrintNode: node =>
        $isFootnoteRefNode(node) ? `[^${node.getFootnoteId()}]` : undefined,
    }),
    MdastCommonMarkExtension,
    MdastGfmExtension,
    MdastShortcutsExtension,
    MdastExportExtension,
    FootnoteExtension,
    FootnoteClipboardExtension,
    FootnoteMdastExtension,
  ],
  name: 'lexical-footnote/playground',
  namespace: 'lexical-footnote-playground',
  theme: {
    quote: 'editor-quote',
    text: {
      strikethrough: 'editor-strikethrough',
      underline: 'editor-underline',
      underlineStrikethrough: 'editor-underline-strikethrough',
    },
  },
});

function Toolbar() {
  const {insertFootnote, cleanupOrphans} =
    useExtensionDependency(FootnoteExtension).output;
  const [editor] = useLexicalComposerContext();
  const [markdown, setMarkdown] = useState('');
  return (
    <>
      <div className="toolbar">
        <button type="button" onClick={insertFootnote}>
          Insert footnote
        </button>
        <button type="button" onClick={cleanupOrphans}>
          Clean up orphans
        </button>
        <button
          type="button"
          onClick={() =>
            editor.update(() => $convertFromMarkdownString(SAMPLE))
          }
        >
          Load sample markdown
        </button>
        <button
          type="button"
          onClick={() =>
            setMarkdown(editor.read(() => $convertToMarkdownString()))
          }
        >
          Export markdown
        </button>
      </div>
      {markdown && <pre className="markdown-out">{markdown}</pre>}
    </>
  );
}

function App() {
  return (
    <main className="playground">
      <p className="site-tagline">
        Insert with the button or by typing <code>[^id]</code>. Click a cue to
        jump, ↩ to jump back, arrow keys traverse notes. Pasting footnotes from
        a Word / Google Docs web view works too.
      </p>
      <LexicalExtensionComposer extension={appExtension}>
        <Toolbar />
        <ExtensionComponent lexical:extension={TreeViewExtension} />
      </LexicalExtensionComposer>
    </main>
  );
}

/**
 * Client-only mount: the docs site is statically generated, and the editor
 * is a browser thing — prerendering it buys nothing and risks the build.
 */
export function Playground() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? <App /> : null;
}
