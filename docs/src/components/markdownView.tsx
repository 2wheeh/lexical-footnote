'use client';

/**
 * The live markdown mirror's renderer: real syntax highlighting via shiki
 * (the same highlighter family vocs uses for its code blocks, so the panel
 * matches the site), assembled from fine-grained parts — core + the
 * JavaScript regex engine + one grammar + two themes — because the mirror
 * re-renders on every edit: after the one-time async init, `codeToHtml` is
 * synchronous, and skipping the oniguruma wasm keeps the lazy chunk small.
 *
 * Footnote tokens are the one thing no stock markdown grammar knows about.
 * shiki's decorations API covers the gap: a regex pass finds `[^id]` /
 * `[^id]:` ranges and wraps each in a `.md-fn` span on top of the grammar's
 * own tokens (styled in playground.css).
 */

import {useEffect, useState} from 'react';
import type {DecorationItem, HighlighterCore} from 'shiki/core';

const FN_TOKEN = /\[\^[^\]\s]+\]:?/g;

function fnDecorations(markdown: string): DecorationItem[] {
  return Array.from(markdown.matchAll(FN_TOKEN), match => ({
    end: match.index + match[0].length,
    properties: {class: 'md-fn'},
    start: match.index,
  }));
}

// Module-level: one highlighter serves every mount, and the dynamic imports
// keep shiki out of the page's initial chunk — it loads when the playground
// mounts, not when the docs site does.
let highlighterPromise: Promise<HighlighterCore> | null = null;

function loadHighlighter(): Promise<HighlighterCore> {
  highlighterPromise ??= (async () => {
    const [core, engine, markdown, light, dark] = await Promise.all([
      import('shiki/core'),
      import('shiki/engine/javascript'),
      import('shiki/langs/markdown.mjs'),
      import('shiki/themes/github-light.mjs'),
      import('shiki/themes/github-dark.mjs'),
    ]);
    return core.createHighlighterCore({
      engine: engine.createJavaScriptRegexEngine(),
      langs: [markdown.default],
      themes: [light.default, dark.default],
    });
  })();
  return highlighterPromise;
}

export function MarkdownView({markdown}: {markdown: string}) {
  const [highlighter, setHighlighter] = useState<HighlighterCore | null>(null);

  useEffect(() => {
    let mounted = true;
    void loadHighlighter().then(instance => {
      if (mounted) {
        setHighlighter(instance);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  // Plain text until the highlighter chunk arrives — same content, no color.
  if (!highlighter) {
    return <pre className="pg-markdown-view">{markdown}</pre>;
  }

  const html = highlighter.codeToHtml(markdown, {
    decorations: fnDecorations(markdown),
    // defaultColor false: both themes ride as CSS variables and
    // playground.css picks one off vocs's html[data-vocs-theme] marker.
    defaultColor: false,
    lang: 'markdown',
    themes: {dark: 'github-dark', light: 'github-light'},
  });

  return (
    <div
      className="pg-markdown-view"
      // Safe by construction: shiki escapes the source text; the only
      // markup in `html` is shiki's own token spans and the .md-fn
      // decoration wrappers above.
      dangerouslySetInnerHTML={{__html: html}}
    />
  );
}
