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
 * `fn-<id>` from our own exportDOM, or GitHub's `user-content-fn-<id>`.
 */
const GFM_FOOTNOTE_ID = /^(?:user-content-)?fn-(.+)$/;

function parseGfmFootnoteId(raw: string): string {
  return GFM_FOOTNOTE_ID.exec(raw)?.[1] ?? '';
}

// Word and Google Docs put footnotes on the clipboard as anchor pairs: a
// cue linking down to the note and a backref linking back up to the cue.
// The cue patterns end at digits, so they can never match the backrefs
// (#_ftnref1 / #ftnt_ref1). Only the fragment tail is matched, unanchored
// at the start: Safari rewrites clipboard hrefs to absolute
// `applewebdata://<uuid>#_ftn1` URLs.
const CUE_PATTERNS = [
  {href: /#_ftn(\d+)$/, source: 'word'},
  {href: /#ftnt(\d+)$/, source: 'gdocs'},
] as const;
const WORD_DEF_ID = /^ftn(\d+)$/;
const GDOCS_DEF_ANCHOR_ID = /^ftnt(\d+)$/;
const IMPORTED_BACKREF_HREF = /#(?:_ftnref|ftnt_ref)\d+$/;

/**
 * Source-number → generated id. Word/Docs number footnotes 1..n, which
 * would collide with existing footnotes or an earlier paste, so pasted
 * footnotes get fresh ids; the map only pairs a cue with its definition
 * within one paste. The default must stay null: context-state defaults
 * are evaluated once and shared across sessions, so a Map default would
 * silently merge repeated pastes.
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
      const id = parseGfmFootnoteId(href.replace(/^.*#/, ''));
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
      parseGfmFootnoteId(el.id ?? '') ||
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
 * The footnote number when `el` is a Word footnote body
 * (`<div id="ftn1">` holding MsoFootnoteText), else null. The id alone is
 * too generic for arbitrary pages, so a Word marker is required too —
 * the class rather than only the mso-element style, because Safari's
 * clipboard sanitization strips mso-* style properties (classes survive).
 */
function wordFootnoteNumber(el: Element): string | null {
  if (el.tagName !== 'DIV') {
    return null;
  }
  const match = WORD_DEF_ID.exec(el.id ?? '');
  const isWordFootnote =
    match !== null &&
    (/mso-element:\s*footnote/.test(el.getAttribute('style') ?? '') ||
      el.querySelector('.MsoFootnoteText') !== null);
  return isWordFootnote ? match[1]! : null;
}

const WordDefinitionImportRule = /* @__PURE__ */ defineImportRule({
  $import: (ctx, el, $next) => {
    const number = wordFootnoteNumber(el);
    if (number === null) {
      return $next();
    }
    stripImportedBackrefs(el);
    const definition = $createFootnoteDefinitionNode(
      resolveImportedId(ctx, `word:${number}`),
    );
    definition.splice(0, 0, ctx.$importChildren(el, {schema: BlockSchema}));
    return [definition];
  },
  match: sel.tag('div'),
  name: 'lexical-footnote/word-definition',
});

/**
 * Word wraps its notes and their separator chrome (`<br clear=all><hr>`)
 * in `<div style="mso-element:footnote-list">`; when Safari has stripped
 * that style, a container holding Word footnote divs is recognized
 * structurally. The separator is the source app's rendering of the
 * footnote area, not content — import only the notes.
 */
const WordFootnoteListImportRule = /* @__PURE__ */ defineImportRule({
  $import: (ctx, el, $next) => {
    const isFootnoteList =
      /mso-element:\s*footnote-list/.test(el.getAttribute('style') ?? '') ||
      Array.from(el.children).some(child => wordFootnoteNumber(child) !== null);
    if (!isFootnoteList) {
      return $next();
    }
    for (const child of Array.from(el.children)) {
      if (child.tagName === 'HR' || child.tagName === 'BR') {
        child.remove();
      }
    }
    return ctx.$importChildren(el);
  },
  match: sel.tag('div'),
  name: 'lexical-footnote/word-footnote-list',
});

/**
 * Google Docs draws its footnote separator as a bare `<hr>` immediately
 * before the notes block. Drop it only in that context; any other `<hr>`
 * falls through to the core rule.
 */
const GoogleDocsSeparatorImportRule = /* @__PURE__ */ defineImportRule({
  $import: (_ctx, el, $next) => {
    const next = el.nextElementSibling;
    const anchor = next?.querySelector('a[id]');
    const isFootnoteSeparator =
      anchor != null &&
      GDOCS_DEF_ANCHOR_ID.test(anchor.getAttribute('id') ?? '');
    return isFootnoteSeparator ? [] : $next();
  },
  match: sel.tag('hr'),
  name: 'lexical-footnote/gdocs-separator',
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
  WordFootnoteListImportRule,
  WordDefinitionImportRule,
  GoogleDocsSeparatorImportRule,
  GoogleDocsDefinitionImportRule,
];
