import type {DOMImportContext} from '@lexical/html';

import {
  BlockSchema,
  createImportState,
  defineImportRule,
  sel,
} from '@lexical/html';

import {$createFootnoteDefinitionNode} from './FootnoteDefinitionNode';
import {$createFootnoteRefNode} from './FootnoteRefNode';
import {$createFootnoteSectionNode} from './FootnoteSectionNode';
import {createFootnoteId} from './state';

/**
 * Accepts both our own exportDOM output and GitHub's rendered GFM footnote
 * HTML (which prefixes ids with `user-content-`).
 */
function parseFootnoteId(raw: string, prefix: 'fn' | 'fnref'): string {
  const match = raw.match(new RegExp(`^(?:user-content-)?${prefix}-(.+)$`));
  return match?.[1] ?? '';
}

// Word and Google Docs put footnotes on the clipboard as anchor pairs:
// a cue linking down to the note (#_ftn1 / #ftnt1) and a backref linking
// up to the cue (#_ftnref1 / #ftnt_ref1). The `ref` patterns deliberately
// end at digits so they never match the backrefs.
const WORD_CUE_HREF = /^#_ftn(\d+)$/;
const WORD_DEF_ID = /^ftn(\d+)$/;
const GDOCS_CUE_HREF = /^#ftnt(\d+)$/;
const GDOCS_DEF_ANCHOR_ID = /^ftnt(\d+)$/;
const IMPORTED_BACKREF_HREF = /^#(?:_ftnref|ftnt_ref)\d+$/;

/**
 * Source-number → generated id, per import pass. Word/Docs number their
 * footnotes 1..n, which would collide with footnotes already in the
 * document (or with a second paste), so each pasted footnote gets a fresh
 * id — this map keeps its cue and definition on the same one.
 */
const importedFootnoteIds = /* @__PURE__ */ createImportState(
  'lexical-footnote/importedIds',
  () => new Map<string, string>(),
);

function resolveImportedId(ctx: DOMImportContext, sourceKey: string): string {
  const ids = ctx.session.get(importedFootnoteIds);
  // The default value is produced fresh per read; store it so later rules
  // in this pass see the same map.
  ctx.session.set(importedFootnoteIds, ids);
  const existing = ids.get(sourceKey);
  if (existing) {
    return existing;
  }
  const id = createFootnoteId();
  ids.set(sourceKey, id);
  return id;
}

/** The `[1]` anchor Word/Docs put at the start of the note's text. */
function stripImportedBackrefs(el: Element): void {
  for (const anchor of Array.from(el.querySelectorAll('a[href]'))) {
    if (IMPORTED_BACKREF_HREF.test(anchor.getAttribute('href') ?? '')) {
      anchor.remove();
    }
  }
}

const FootnoteRefImportRule = /* @__PURE__ */ defineImportRule({
  $import: (ctx, el, $next) => {
    const href = el.getAttribute('href') ?? '';
    if (el.getAttribute('data-footnote-ref') !== null) {
      const id = parseFootnoteId(href.replace(/^.*#/, ''), 'fn');
      return id ? [$createFootnoteRefNode(id)] : $next();
    }
    const word = WORD_CUE_HREF.exec(href);
    if (word) {
      return [$createFootnoteRefNode(resolveImportedId(ctx, `word:${word[1]}`))];
    }
    const gdocs = GDOCS_CUE_HREF.exec(href);
    if (gdocs) {
      return [
        $createFootnoteRefNode(resolveImportedId(ctx, `gdocs:${gdocs[1]}`)),
      ];
    }
    return $next();
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
    stripImportedBackrefs(el);
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

/** Word: `<div style="mso-element:footnote" id="ftn1"><p>…</p></div>` */
const WordDefinitionImportRule = /* @__PURE__ */ defineImportRule({
  $import: (ctx, el, $next) => {
    const match = WORD_DEF_ID.exec(el.id ?? '');
    if (!match) {
      return $next();
    }
    stripImportedBackrefs(el);
    const definition = $createFootnoteDefinitionNode(
      resolveImportedId(ctx, `word:${match[1]}`),
    );
    definition.splice(0, 0, ctx.$importChildren(el, {schema: BlockSchema}));
    return [definition];
  },
  match: sel.tag('div'),
  name: 'lexical-footnote/word-definition',
});

/**
 * Google Docs: `<p><a href="#ftnt_ref1" id="ftnt1">[1]</a> …</p>` — the
 * note is identified by its leading anchor, not by a container attribute.
 */
const GoogleDocsDefinitionImportRule = /* @__PURE__ */ defineImportRule({
  $import: (ctx, el, $next) => {
    const anchor = el.querySelector('a[id]');
    const match = anchor
      ? GDOCS_DEF_ANCHOR_ID.exec(anchor.getAttribute('id') ?? '')
      : null;
    if (!match) {
      return $next();
    }
    stripImportedBackrefs(el);
    const definition = $createFootnoteDefinitionNode(
      resolveImportedId(ctx, `gdocs:${match[1]}`),
    );
    definition.splice(0, 0, ctx.$importChildren(el, {schema: BlockSchema}));
    return [definition];
  },
  match: sel.tag('p'),
  name: 'lexical-footnote/gdocs-definition',
});

export const FootnoteImportRules = [
  FootnoteRefImportRule,
  FootnoteDefinitionImportRule,
  FootnoteSectionImportRule,
  WordDefinitionImportRule,
  GoogleDocsDefinitionImportRule,
];
