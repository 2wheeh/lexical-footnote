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

// Word and Google Docs put footnotes on the clipboard as anchor pairs: a
// cue linking down to the note and a backref linking back up to the cue.
// The cue patterns end at digits, so they can never match the backrefs
// (#_ftnref1 / #ftnt_ref1).
const CUE_PATTERNS = [
  {href: /^#_ftn(\d+)$/, source: 'word'},
  {href: /^#ftnt(\d+)$/, source: 'gdocs'},
] as const;
const WORD_DEF_ID = /^ftn(\d+)$/;
const GDOCS_DEF_ANCHOR_ID = /^ftnt(\d+)$/;
const IMPORTED_BACKREF_HREF = /^#(?:_ftnref|ftnt_ref)\d+$/;

/**
 * Source-number → generated id, one map per import pass. Word/Docs number
 * their footnotes 1..n, which would collide with footnotes already in the
 * document (or with an earlier paste), so every pasted footnote gets a
 * fresh id; the map only pairs a cue with its definition within the same
 * paste. The default is null — a Map default would be evaluated once and
 * shared across all sessions (context-state defaults are single
 * instances), silently merging repeated pastes.
 */
const importedFootnoteIds = /* @__PURE__ */ createImportState<Map<
  string,
  string
> | null>('lexical-footnote/importedIds', () => null);

function resolveImportedId(ctx: DOMImportContext, sourceKey: string): string {
  let ids = ctx.session.get(importedFootnoteIds);
  if (!ids) {
    ids = new Map();
    ctx.session.set(importedFootnoteIds, ids);
  }
  let id = ids.get(sourceKey);
  if (!id) {
    id = createFootnoteId();
    ids.set(sourceKey, id);
  }
  return id;
}

/** Drops the literal `[1]` anchors Word/Docs put at the start of a note. */
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
    for (const {href: pattern, source} of CUE_PATTERNS) {
      const match = pattern.exec(href);
      if (match) {
        return [
          $createFootnoteRefNode(
            resolveImportedId(ctx, `${source}:${match[1]}`),
          ),
        ];
      }
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

/**
 * Word: `<div style="mso-element:footnote" id="ftn1"><p>…</p></div>`.
 * The id alone (`ftn1`) is too generic for arbitrary web pages, so a Word
 * marker — the mso-element style or an MsoFootnoteText paragraph — is
 * required as well.
 */
const WordDefinitionImportRule = /* @__PURE__ */ defineImportRule({
  $import: (ctx, el, $next) => {
    const match = WORD_DEF_ID.exec(el.id ?? '');
    const isWordFootnote =
      match !== null &&
      (/mso-element:\s*footnote/.test(el.getAttribute('style') ?? '') ||
        el.querySelector('.MsoFootnoteText') !== null);
    if (!isWordFootnote) {
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
 * (Body cues carry `id="ftnt_ref1"`, which the pattern rejects.)
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
