import {defineConfig} from 'vocs/config';

export default defineConfig({
  title: 'lexical-footnote',
  description:
    'GFM footnote extension for Lexical — footnote refs, definitions, in-page links, and mdast markdown round-trip.',
  renderStrategy: 'full-static',
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
