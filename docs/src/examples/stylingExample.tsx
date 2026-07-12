'use client';

/**
 * Live demo for the Styling guide: a `.fn-themed` editor with one color
 * picker per token. footnoteTheme.css (the guide's code block, `[!include]`d
 * whole) sets the starting values; the pickers write the same custom
 * properties inline. A docs-only theme-toggle shim lives in
 * footnoteTheme.docs.css, kept separate so it never appears in the guide.
 */

import type {CSSProperties} from 'react';

import {useEffect, useRef, useState} from 'react';

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

const TOKENS = [
  '--lexical-footnote-accent',
  '--lexical-footnote-accent-contrast',
  '--lexical-footnote-note-color',
  '--lexical-footnote-rule-color',
] as const;

/** Definitions heal on commit, so the note's text lands in a second pass. */
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
  const figureRef = useRef<HTMLElement>(null);
  const [colors, setColors] = useState<Record<string, string>>({});

  // Custom properties come back as declared (hex, theme-resolved), so the
  // pickers can start from whatever footnoteTheme.css put on the wrapper.
  useEffect(() => {
    const figure = figureRef.current;
    if (!figure) {
      return;
    }
    const computed = getComputedStyle(figure);
    setColors(current => {
      const next = {...current};
      for (const token of TOKENS) {
        next[token] ??= computed.getPropertyValue(token).trim();
      }
      return next;
    });
  }, []);

  return (
    <figure
      className="docs-demo fn-themed"
      ref={figureRef}
      style={colors as CSSProperties}
    >
      <figcaption className="docs-demo-tokens">
        {TOKENS.map(token => (
          <label key={token}>
            {token.replace('--lexical-footnote-', '')}
            <input
              type="color"
              value={colors[token] ?? '#000000'}
              onChange={event =>
                setColors(current => ({
                  ...current,
                  [token]: event.target.value,
                }))
              }
            />
          </label>
        ))}
      </figcaption>
      <LexicalExtensionComposer extension={extension} />
    </figure>
  );
}

/** Client-only mount: the docs site is statically generated. */
export function StylingExample() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? <Demo /> : null;
}
