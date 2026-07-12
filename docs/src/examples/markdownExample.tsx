'use client';

/**
 * Live demo for the Markdown guide: an editor next to its exact
 * serialization, re-read on every commit. The `register` region below is
 * `[!include]`d into the guide's code block — the extension you read is the
 * extension running here; the frame around it only adds layout and the
 * live mirror.
 */

import type {EditorChildrenComponentProps} from '@lexical/react/ReactExtension';

import {useEffect, useState} from 'react';

import {HistoryExtension} from '@lexical/history';
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
} from '@lexical/mdast';
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {LexicalExtensionComposer} from '@lexical/react/LexicalExtensionComposer';
import {ReactExtension} from '@lexical/react/ReactExtension';
import {configExtension} from 'lexical';

import 'lexical-footnote/styles.css';
import './examples.css';

// [!region register]
import {
  MdastCommonMarkExtension,
  MdastExportExtension,
  MdastGfmExtension,
  MdastShortcutsExtension,
} from '@lexical/mdast';
import {RichTextExtension} from '@lexical/rich-text';
import {defineExtension} from 'lexical';
import {FootnoteExtension} from 'lexical-footnote';
import {FootnoteMdastExtension} from 'lexical-footnote/mdast';

const extension = defineExtension({
  dependencies: [
    RichTextExtension,
    MdastCommonMarkExtension,
    MdastGfmExtension,
    MdastShortcutsExtension,
    MdastExportExtension,
    FootnoteExtension,
    FootnoteMdastExtension,
  ],
  name: 'my-editor',
  namespace: 'my-app',
});
// [!endregion register]

// One unwrapped line per paragraph: $convertFromMarkdownString reads a
// mid-paragraph line break as a real soft break.
const SAMPLE = `Numbers are derived, never stored.[^order]

[^order]: Body cues first, then whatever the notes themselves cite.
`;

function Body({contentEditable, children}: EditorChildrenComponentProps) {
  const [editor] = useLexicalComposerContext();
  const [markdown, setMarkdown] = useState('');

  // Sample document on mount, live serialization thereafter: one
  // registerUpdateListener drives both — the initial load is itself an
  // update.
  useEffect(() => {
    let frame = 0;
    const sync = () => {
      frame = 0;
      editor.read(() => setMarkdown($convertToMarkdownString()));
    };
    const unregister = editor.registerUpdateListener(() => {
      if (frame) {
        return;
      }
      frame = requestAnimationFrame(sync);
    });
    editor.update(() => $convertFromMarkdownString(SAMPLE));
    return () => {
      unregister();
      if (frame) {
        cancelAnimationFrame(frame);
      }
    };
  }, [editor]);

  return (
    <div className="docs-demo-grid">
      <figure className="docs-demo">
        <figcaption>Edit — the notes too</figcaption>
        {contentEditable}
        {/* Decorator portals (every cue) ride in as `children`; dropping
            them unmounts every cue in the document. */}
        {children}
      </figure>
      <figure className="docs-demo">
        <figcaption>
          <code>$convertToMarkdownString()</code>, on every commit
        </figcaption>
        <pre className="docs-demo-output">{markdown}</pre>
      </figure>
    </div>
  );
}

const demoExtension = defineExtension({
  dependencies: [
    extension,
    HistoryExtension,
    configExtension(ReactExtension, {EditorChildrenComponent: Body}),
  ],
  name: 'docs/markdown-example',
  namespace: 'lexical-footnote-docs',
});

function Demo() {
  return <LexicalExtensionComposer extension={demoExtension} />;
}

/** Client-only mount: the docs site is statically generated. */
export function MarkdownExample() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? <Demo /> : null;
}
