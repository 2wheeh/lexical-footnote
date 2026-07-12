'use client';

/**
 * Live demo for the Styling guide: the same seeded document twice — once
 * inheriting the page (the stylesheet's zero-config mode), once wrapped in
 * `.fn-themed`, the token set the guide shows. footnoteTheme.css is
 * `[!include]`d into the page's code block whole — the CSS you read is the
 * CSS running here (plus a docs-only theme-toggle shim, kept in a separate
 * file precisely so it never appears in the guide).
 */

import {useEffect, useState} from 'react';

import {HistoryExtension} from '@lexical/history';
import {LexicalExtensionComposer} from '@lexical/react/LexicalExtensionComposer';
import {RichTextExtension} from '@lexical/rich-text';
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $isElementNode,
  defineExtension,
  type LexicalEditor,
} from 'lexical';

import {
  $createFootnoteRefNode,
  $getFootnoteDefinition,
  FootnoteExtension,
} from 'lexical-footnote';

import 'lexical-footnote/styles.css';
import './examples.css';
import './footnoteTheme.css';
import './footnoteTheme.docs.css';

/**
 * Two updates, like the package's own tests: the definition doesn't exist
 * until the healing transform commits, so its text lands in a second pass.
 */
function seed(editor: LexicalEditor) {
  editor.update(
    () => {
      $getRoot()
        .clear()
        .append(
          $createParagraphNode().append(
            $createTextNode('The stylesheet dresses the cue'),
            $createFootnoteRefNode('cue'),
            $createTextNode(' and the notes list below — nothing else.'),
          ),
        );
    },
    {discrete: true},
  );
  editor.update(
    () => {
      const paragraph = $getFootnoteDefinition('cue')?.getFirstChild();
      if ($isElementNode(paragraph)) {
        paragraph.append(
          $createTextNode('Sized in em, colored from the tokens. Editable.'),
        );
      }
    },
    {discrete: true},
  );
}

const extension = defineExtension({
  dependencies: [RichTextExtension, HistoryExtension, FootnoteExtension],
  name: 'docs/styling-example',
  namespace: 'lexical-footnote-docs',
  register: editor => {
    seed(editor);
    return () => {};
  },
});

function Demo() {
  return (
    <div className="docs-demo-grid">
      <figure className="docs-demo">
        <figcaption>Zero configuration — inherits this page</figcaption>
        <LexicalExtensionComposer extension={extension} />
      </figure>
      <figure className="docs-demo fn-themed">
        <figcaption>
          <code>.fn-themed</code> — the tokens above
        </figcaption>
        <LexicalExtensionComposer extension={extension} />
      </figure>
    </div>
  );
}

/** Client-only mount: the docs site is statically generated. */
export function StylingExample() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? <Demo /> : null;
}
