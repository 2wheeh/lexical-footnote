import {useState} from 'react';

import {AutoFocusExtension} from '@lexical/extension';
import {HistoryExtension} from '@lexical/history';
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
  MdastCommonMarkExtension,
  MdastExportExtension,
} from '@lexical/mdast';
import {LexicalExtensionComposer} from '@lexical/react/LexicalExtensionComposer';
import {TreeViewExtension} from '@lexical/react/TreeViewExtension';
import {ExtensionComponent} from '@lexical/react/ExtensionComponent';
import {useExtensionDependency} from '@lexical/react/useExtensionComponent';
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {RichTextExtension} from '@lexical/rich-text';
import {defineExtension} from 'lexical';

import {FootnoteExtension} from '../src';
import {FootnoteMdastExtension} from '../src/mdast';

const SAMPLE = `Footnotes work like GFM[^gfm], with in-page links[^links].

[^gfm]: One definition per identifier, numbered by reference order.

[^links]: Click a cue to jump to its definition, and ↩ to jump back.
`;

const appExtension = defineExtension({
  dependencies: [
    RichTextExtension,
    AutoFocusExtension,
    HistoryExtension,
    TreeViewExtension,
    MdastCommonMarkExtension,
    MdastExportExtension,
    FootnoteExtension,
    FootnoteMdastExtension,
  ],
  name: 'lexical-footnote/dev',
  namespace: 'lexical-footnote-dev',
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
          }>
          Load sample markdown
        </button>
        <button
          type="button"
          onClick={() =>
            setMarkdown(editor.read(() => $convertToMarkdownString()))
          }>
          Export markdown
        </button>
      </div>
      {markdown && <pre className="markdown-out">{markdown}</pre>}
    </>
  );
}

export function App() {
  return (
    <main>
      <header className="site-header">
        <h1>lexical-footnote</h1>
        <nav className="site-links">
          <a
            href="https://github.com/2wheeh/lexical-footnote"
            target="_blank"
            rel="noreferrer">
            GitHub
          </a>
          <a
            href="https://www.npmjs.com/package/lexical-footnote"
            target="_blank"
            rel="noreferrer">
            npm
          </a>
        </nav>
      </header>
      <p className="site-tagline">
        GFM footnotes for Lexical — insert with the button or by typing{' '}
        <code>[^id]</code>, click a cue to jump, ↩ to jump back, arrow keys
        traverse notes.
      </p>
      <LexicalExtensionComposer extension={appExtension}>
        <Toolbar />
        <ExtensionComponent lexical:extension={TreeViewExtension} />
      </LexicalExtensionComposer>
    </main>
  );
}
