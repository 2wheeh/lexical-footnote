'use client';

import {useEffect, useRef, useState} from 'react';

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
import type {EditorChildrenComponentProps} from '@lexical/react/ReactExtension';
import {ReactExtension} from '@lexical/react/ReactExtension';
import {RichTextExtension} from '@lexical/rich-text';
import {configExtension, defineExtension} from 'lexical';

import {$isFootnoteRefNode, FootnoteExtension} from 'lexical-footnote';
import {FootnoteClipboardExtension} from 'lexical-footnote/clipboard';
import {FootnoteMdastExtension} from 'lexical-footnote/mdast';

import {MarkdownView} from './markdownView';
import {NotePreview} from './notePreview';
import 'lexical-footnote/styles.css';
import './playground.css';

// Each paragraph, blockquote line, and footnote definition is one
// unwrapped line — $convertFromMarkdownString treats a mid-paragraph
// line break as a real soft break, so hard-wrapping this constant (as if
// it were display text) would leak mid-sentence breaks and the
// definitions' continuation-indent spacing straight into the document.
const SAMPLE = `# Footnotes, computed

**lexical-footnote** brings GFM footnotes to [Lexical](https://lexical.dev): superscript cues in the body, an auto-managed notes section at the end of the document, and markdown that round-trips exactly[^mdast].

Numbers are never stored. They are derived from citation order on every commit[^order] — reorder the body and the numbering follows. The exported HTML matches GitHub's, byte for byte[^order].

> A footnote is a second voice at the foot of the page — subordinate, but on the page, in the document.[^voice]

[^mdast]: Round-tripped through [@lexical/mdast](https://github.com/facebook/lexical) — \`[^id]\` in, \`[^id]: …\` out, exactly.

[^order]: Body cues first, then whatever the notes themselves cite — recomputed each commit, exposed as a signal, never stored on a node.

[^voice]: And so it survives copy, export, and a round-trip through markdown — unlike a comment in the margin.
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
    //
    // The class hooks style TreeView's otherwise-classless native buttons
    // and wrapper — the rules live under `.pg-tree-*` in playground.css.
    configExtension(TreeViewExtension, {
      customPrintNode: node =>
        $isFootnoteRefNode(node) ? `[^${node.getFootnoteId()}]` : undefined,
      timeTravelButtonClassName: 'pg-tree-btn',
      timeTravelPanelButtonClassName: 'pg-tree-timetravel-btn',
      timeTravelPanelClassName: 'pg-tree-timetravel',
      timeTravelPanelSliderClassName: 'pg-tree-timetravel-slider',
      treeTypeButtonClassName: 'pg-tree-btn',
      viewClassName: 'pg-tree-view',
    }),
    // The default EditorChildrenComponent renders `{contentEditable}` then
    // `{children}` flat, in that order — not enough to put the toolbar
    // above the editor and the inspector below it. Overriding it is the
    // sanctioned way to lay the editor's children out arbitrarily.
    configExtension(ReactExtension, {EditorChildrenComponent: PlaygroundBody}),
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

function PlaygroundBody({
  contentEditable,
  children,
}: EditorChildrenComponentProps) {
  const {insertFootnote, cleanupOrphans} =
    useExtensionDependency(FootnoteExtension).output;
  const [editor] = useLexicalComposerContext();
  const [markdown, setMarkdown] = useState('');
  const [panelTab, setPanelTab] = useState<'markdown' | 'inspect'>('markdown');
  const shellRef = useRef<HTMLDivElement>(null);

  // Sample document on mount, and a live markdown mirror thereafter: one
  // registerUpdateListener drives both the initial load (itself an update)
  // and every edit after it.
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

  // Demo-only: flash the target note after a cue jump. Capture phase
  // because the cue buttons are the extension's own DOM, recreated as the
  // document changes — delegating on the shell is what survives that.
  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) {
      return;
    }

    function onClickCapture(event: MouseEvent) {
      const target = event.target;
      const button =
        target instanceof Element
          ? target.closest('.lexical-footnote__ref button')
          : null;
      if (!button) {
        return;
      }
      const id = button
        .closest('.lexical-footnote__ref')
        ?.getAttribute('data-lexical-footnote-ref');
      if (!id || !shell) {
        return;
      }
      const li = shell.querySelector(`[data-lexical-footnote-item="${id}"]`);
      if (!(li instanceof HTMLElement)) {
        return;
      }
      li.classList.remove('pg-flash');
      void li.offsetWidth;
      li.classList.add('pg-flash');
    }
    shell.addEventListener('click', onClickCapture, true);

    return () => {
      shell.removeEventListener('click', onClickCapture, true);
    };
  }, []);

  return (
    <>
      <div className="pg-toolbar" role="toolbar" aria-label="Editor actions">
        <button
          type="button"
          className="pg-btn-primary"
          onClick={insertFootnote}
        >
          Insert footnote
        </button>
        <button type="button" onClick={cleanupOrphans}>
          Clean up orphans
        </button>
        <button
          type="button"
          className="pg-btn-soon"
          title="Import a .docx document, footnotes included"
          onClick={() =>
            console.log('[playground] docx import: not implemented — roadmap')
          }
        >
          Import .docx <span className="pg-soon-tag">soon</span>
        </button>
      </div>

      <div className="pg-editor-shell" ref={shellRef}>
        {contentEditable}
        {/* `children` here isn't ours — buildEditorComponent passes every
            node-decorator portal (each cue's FootnoteRefComponent, plus any
            other DecoratorNode content) through as this prop. Dropping it
            silently unmounts every decorator in the document, so it must
            always be rendered somewhere inside the composer tree. */}
        {children}
      </div>
      <NotePreview shellRef={shellRef} />

      <p className="pg-try">
        Try it — place the caret anywhere and type{' '}
        <kbd className="pg-caret-cue">[^note]</kbd> — the cue and its note
        materialize as you type.
      </p>

      <div className="pg-legend" aria-label="Keyboard and pointer interactions">
        <span>
          <kbd>click</kbd> a cue jumps to its note
        </span>
        <span>
          <kbd>↩</kbd> returns to the cue
        </span>
        <span>
          <kbd>↑</kbd>
          <kbd>↓</kbd> traverse the notes
        </span>
        <span>
          <kbd>hover</kbd> a cue floats its note up
        </span>
      </div>

      <p className="pg-fineprint">
        Footnotes pasted from Word or a Google Docs web view land as real
        footnotes — cues, notes, numbering and all.
      </p>

      {/* Both tab bodies stay mounted (toggled via `hidden`, not
          conditionally rendered) so the TreeView's own state — time
          travel, export-DOM mode — survives switching away and back. */}
      <div className="pg-panel">
        <div className="pg-panel-head">
          <div
            className="pg-panel-tabs"
            role="tablist"
            aria-label="Document views"
          >
            <button
              type="button"
              role="tab"
              aria-selected={panelTab === 'markdown'}
              className="pg-panel-tab"
              onClick={() => setPanelTab('markdown')}
            >
              Markdown
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={panelTab === 'inspect'}
              className="pg-panel-tab"
              onClick={() => setPanelTab('inspect')}
            >
              Inspect
            </button>
          </div>
          <span className="pg-panel-caption">
            {panelTab === 'markdown'
              ? 'round-trips exactly'
              : 'node tree · numbers signal'}
          </span>
        </div>
        <div className="pg-panel-body" hidden={panelTab !== 'markdown'}>
          <MarkdownView markdown={markdown} />
        </div>
        <div className="pg-panel-body" hidden={panelTab !== 'inspect'}>
          <ExtensionComponent lexical:extension={TreeViewExtension} />
        </div>
      </div>
    </>
  );
}

function App() {
  return (
    <div className="playground">
      <header className="pg-head">
        <h1>Playground</h1>
      </header>
      <p className="pg-lede">
        A live document, footnotes included. Everything below is editable — the
        notes too. Numbers are computed from citation order, never stored; the
        markdown alongside is the document&rsquo;s exact serialization.
      </p>
      <LexicalExtensionComposer extension={appExtension} />
    </div>
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
