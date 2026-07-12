'use client';

/**
 * Live demo for the Clipboard guide: one editor seeded with a footnote, one
 * empty — copy from the first, paste into the second, the note follows. The
 * `register` region is `[!include]`d into the guide's code block.
 */

import {useEffect, useState} from 'react';

import {HistoryExtension} from '@lexical/history';
import {LexicalExtensionComposer} from '@lexical/react/LexicalExtensionComposer';
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $isElementNode,
  type LexicalEditor,
} from 'lexical';

import {$createFootnoteRefNode, $getFootnoteDefinition} from 'lexical-footnote';

import 'lexical-footnote/styles.css';
import './examples.css';

// [!region register]
import {RichTextExtension} from '@lexical/rich-text';
import {defineExtension} from 'lexical';
import {FootnoteExtension} from 'lexical-footnote';
import {FootnoteClipboardExtension} from 'lexical-footnote/clipboard';

const extension = defineExtension({
  dependencies: [
    RichTextExtension,
    FootnoteExtension,
    FootnoteClipboardExtension,
  ],
  name: 'my-editor',
  namespace: 'my-app',
});
// [!endregion register]

/** Definitions heal on commit, so the note's text lands in a second pass. */
function seed(editor: LexicalEditor) {
  editor.update(
    () => {
      $getRoot()
        .clear()
        .append(
          $createParagraphNode().append(
            $createTextNode('Select this sentence, cue included'),
            $createFootnoteRefNode('carry'),
            $createTextNode(', and copy it.'),
          ),
        );
    },
    {discrete: true},
  );
  editor.update(
    () => {
      const paragraph = $getFootnoteDefinition('carry')?.getFirstChild();
      if ($isElementNode(paragraph)) {
        paragraph.append($createTextNode('The note rides in the payload.'));
      }
    },
    {discrete: true},
  );
}

const sourceExtension = defineExtension({
  dependencies: [extension, HistoryExtension],
  name: 'docs/clipboard-source',
  namespace: 'lexical-footnote-docs',
  register: editor => {
    seed(editor);
    return () => {};
  },
});

const targetExtension = defineExtension({
  dependencies: [extension, HistoryExtension],
  name: 'docs/clipboard-target',
  namespace: 'lexical-footnote-docs',
});

function Demo() {
  return (
    <div className="docs-demo-stack">
      <figure className="docs-demo">
        <figcaption>Copy from here — select across the cue</figcaption>
        <LexicalExtensionComposer extension={sourceExtension} />
      </figure>
      <figure className="docs-demo">
        <figcaption>Paste here — the note follows its cue</figcaption>
        <LexicalExtensionComposer extension={targetExtension} />
      </figure>
    </div>
  );
}

/** Client-only mount: the docs site is statically generated. */
export function ClipboardExample() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? <Demo /> : null;
}
