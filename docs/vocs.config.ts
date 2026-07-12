import {defineConfig} from 'vocs/config';

export default defineConfig({
  title: 'lexical-footnote',
  description:
    'GFM footnote extension for Lexical — footnote refs, definitions, in-page links, and mdast markdown round-trip.',
  renderStrategy: 'full-static',
  twoslash: {
    // twoslash fails on Vercel's cold build: @typescript/vfs's lib map lacks
    // TS 5.9's lib.es2025.iterator.d.ts — a vfs bug that isn't reproducible
    // locally. Instead of fixing the vfs, cache twoslash results inline
    // (//@twoslash-cache comments, written by a local build and committed) so
    // cold CI builds read the cache and never re-run twoslash — annotations
    // still render. throws:false guards a cache miss (an edited snippet whose
    // cache wasn't regenerated). Regenerate by rebuilding docs after editing
    // any twoslash snippet.
    inlineCache: true,
    throws: false,
    twoslashOptions: {
      compilerOptions: {
        jsx: 4, // JsxEmit.ReactJSX
        jsxImportSource: 'react',
        strict: true,
      },
    },
  },
  topNav: [
    {text: 'Docs', link: '/docs/getting-started'},
    {text: 'Playground', link: '/playground'},
  ],
  sidebar: [
    {
      text: 'Introduction',
      items: [{text: 'Getting Started', link: '/docs/getting-started'}],
    },
  ],
  socials: [
    {
      icon: 'github',
      link: 'https://github.com/2wheeh/lexical-footnote',
    },
  ],
});
