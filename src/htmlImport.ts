import {BlockSchema, defineImportRule, sel} from '@lexical/html';

import {$createFootnoteDefinitionNode} from './FootnoteDefinitionNode';
import {$createFootnoteRefNode} from './FootnoteRefNode';
import {$createFootnoteSectionNode} from './FootnoteSectionNode';

/**
 * Accepts both our own exportDOM output and GitHub's rendered GFM footnote
 * HTML (which prefixes ids with `user-content-`).
 */
function parseFootnoteId(raw: string, prefix: 'fn' | 'fnref'): string {
  const match = raw.match(
    new RegExp(`^(?:user-content-)?${prefix}-(.+)$`),
  );
  return match?.[1] ?? '';
}

const FootnoteRefImportRule = /* @__PURE__ */ defineImportRule({
  $import: (_ctx, el, $next) => {
    if (el.getAttribute('data-footnote-ref') === null) {
      return $next();
    }
    const href = el.getAttribute('href') ?? '';
    const id = parseFootnoteId(href.replace(/^.*#/, ''), 'fn');
    return id ? [$createFootnoteRefNode(id)] : $next();
  },
  match: sel.tag('a'),
  name: 'lexical-footnote/ref',
});

const FootnoteDefinitionImportRule = /* @__PURE__ */ defineImportRule({
  $import: (ctx, el, $next) => {
    const id =
      parseFootnoteId(el.id ?? '', 'fn') ||
      el.getAttribute('data-lexical-footnote-def') ||
    '';
    if (!id) {
      return $next();
    }
    for (const backref of Array.from(
      el.querySelectorAll('[data-footnote-backref]'),
    )) {
      backref.remove();
    }
    const definition = $createFootnoteDefinitionNode(id);
    definition.splice(0, 0, ctx.$importChildren(el, {schema: BlockSchema}));
    return [definition];
  },
  match: sel.tag('li'),
  name: 'lexical-footnote/definition',
});

const FootnoteSectionImportRule = /* @__PURE__ */ defineImportRule({
  $import: (ctx, el, $next) => {
    if (el.getAttribute('data-footnotes') === null) {
      return $next();
    }
    const list =
      Array.from(el.children).find(child => child.tagName === 'OL') ?? el;
    const section = $createFootnoteSectionNode();
    section.splice(0, 0, ctx.$importChildren(list));
    return [section];
  },
  match: sel.tag('section'),
  name: 'lexical-footnote/section',
});

export const FootnoteImportRules = [
  FootnoteRefImportRule,
  FootnoteDefinitionImportRule,
  FootnoteSectionImportRule,
];
