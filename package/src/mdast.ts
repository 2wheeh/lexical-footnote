import type {MdastExportHandler, MdastImportHandler} from '@lexical/mdast';
import type {
  BlockContent,
  DefinitionContent,
  FootnoteDefinition,
  FootnoteReference,
  PhrasingContent,
} from 'mdast';

import {MdastImportExtension} from '@lexical/mdast';
import {
  gfmFootnoteFromMarkdown,
  gfmFootnoteToMarkdown,
} from 'mdast-util-gfm-footnote';
import {defaultHandlers, type Options} from 'mdast-util-to-markdown';
import {configExtension, defineExtension} from 'lexical';
import {gfmFootnote} from 'micromark-extension-gfm-footnote';

import {
  $createFootnoteDefinitionNode,
  FootnoteDefinitionNode,
} from './nodes/FootnoteDefinitionNode';
import {FootnoteExtension} from './FootnoteExtension';
import {$createFootnoteRefNode, FootnoteRefNode} from './nodes/FootnoteRefNode';
import {FootnoteSectionNode} from './nodes/FootnoteSectionNode';
import {$computeFootnoteNumbers, orderFootnoteIds} from './model/numbering';
import {$getDefinitionEntries, $getDefinitionSlot} from './model/slots';

// The surrounding emphasis/strong/delete formats (`**x[^a]**`) land on the
// cue's DecoratorTextNode format bitmask, the way they land on text nodes.
const $importFootnoteReference: MdastImportHandler<FootnoteReference> = (
  node,
  ctx,
) => {
  return node.identifier
    ? $createFootnoteRefNode(node.identifier).setFormat(ctx.format)
    : null;
};

const $importFootnoteDefinition: MdastImportHandler<FootnoteDefinition> = (
  node,
  ctx,
) => {
  if (!node.identifier) {
    return null;
  }
  const definition = $createFootnoteDefinitionNode(node.identifier);
  definition.append(...ctx.importChildren(node));
  // Returned as an ordinary node wherever the markdown declared it;
  // $defTransform slots it onto the section on commit.
  return definition;
};

const $exportFootnoteRef: MdastExportHandler<FootnoteRefNode> = node => {
  const identifier = node.getFootnoteId();
  if (!identifier) {
    return null;
  }
  let content: PhrasingContent = {
    identifier,
    label: identifier,
    type: 'footnoteReference',
  };
  // The format bitmask re-wraps in phrasing containers, nesting in the same
  // order as the core text serialization (emphasis innermost) so a formatted
  // cue merges with the adjacent same-format text run (see
  // mergeAdjacentPhrasing).
  if (node.hasFormat('italic')) {
    content = {children: [content], type: 'emphasis'};
  }
  if (node.hasFormat('bold')) {
    content = {children: [content], type: 'strong'};
  }
  if (node.hasFormat('strikethrough')) {
    content = {children: [content], type: 'delete'};
  }
  return content;
};

const $exportFootnoteDefinition: MdastExportHandler<FootnoteDefinitionNode> = (
  node,
  ctx,
) => {
  const identifier = node.getFootnoteId();
  if (!identifier) {
    return null;
  }
  return {
    children: ctx.exportChildren(node) as Array<
      BlockContent | DefinitionContent
    >,
    identifier,
    label: identifier,
    type: 'footnoteDefinition',
  };
};

/**
 * The section is invisible in markdown: it flattens to its definitions.
 * Those are slot values, not children, so they are gathered from the slot
 * map and emitted in derived reference order.
 */
const $exportFootnoteSection: MdastExportHandler<FootnoteSectionNode> = (
  node,
  ctx,
) => {
  const numbers = $computeFootnoteNumbers();
  const ids = $getDefinitionEntries(node).map(entry => entry.footnoteId);
  const definitions: FootnoteDefinition[] = [];
  for (const footnoteId of orderFootnoteIds(ids, numbers)) {
    const definition = $getDefinitionSlot(node, footnoteId);
    if (definition) {
      definitions.push({
        children: ctx.exportChildren(definition) as Array<
          BlockContent | DefinitionContent
        >,
        identifier: footnoteId,
        label: footnoteId,
        type: 'footnoteDefinition',
      });
    }
  }
  return definitions;
};

// The registry's text-run accumulator merges adjacent same-format TEXT into
// one delimiter pair, but a formatted cue exports through its own handler, so
// `**x**` + `**[^a]**` sit side by side and would serialize as the broken,
// non-re-parseable `**x****[^a]**`. Folding adjacent same-type wrappers back
// together before serialization keeps the emitted Markdown re-parseable
// (`**x[^a]**`).
const MERGEABLE_PHRASING = new Set(['delete', 'emphasis', 'strong']);

function mergeAdjacentPhrasing(node: {children?: unknown[]}): void {
  const children = (node.children ?? []) as {
    type: string;
    children?: unknown[];
  }[];
  for (let i = children.length - 1; i > 0; i--) {
    const prev = children[i - 1];
    const current = children[i];
    if (
      prev !== undefined &&
      current !== undefined &&
      MERGEABLE_PHRASING.has(current.type) &&
      prev.type === current.type &&
      prev.children !== undefined &&
      current.children !== undefined
    ) {
      prev.children.push(...current.children);
      children.splice(i, 1);
    }
  }
  children.forEach(mergeAdjacentPhrasing);
}

// A contributed to-markdown `root` handler folds adjacent same-format wrappers
// across the whole tree just before serialization; SYNTAX_TO_MARKDOWN (which
// @lexical/mdast appends last) defines no `root` handler, so this one wins.
const footnotesRootHandler = {
  handlers: {
    root: (node, parent, state, info) => {
      mergeAdjacentPhrasing(node);
      return defaultHandlers.root(node, parent, state, info);
    },
  },
} satisfies Options;

/**
 * GFM footnote (`[^1]` / `[^1]: …`) round-trip for `@lexical/mdast`,
 * following the MdastTableExtension pattern. Opt-in and separate from the
 * core FootnoteExtension so editors without markdown never load the
 * micromark/mdast machinery.
 */
export const FootnoteMdastExtension = /* @__PURE__ */ defineExtension({
  dependencies: [
    FootnoteExtension,
    /* @__PURE__ */ configExtension(MdastImportExtension, {
      exportRules: [
        {$export: $exportFootnoteRef, type: 'footnote-ref'},
        {$export: $exportFootnoteDefinition, type: 'footnote-def'},
        {$export: $exportFootnoteSection, type: 'footnote-section'},
      ],
      importRules: [
        {$import: $importFootnoteReference, type: 'footnoteReference'},
        {$import: $importFootnoteDefinition, type: 'footnoteDefinition'},
      ],
      mdastExtensions: [/* @__PURE__ */ gfmFootnoteFromMarkdown()],
      micromarkExtensions: [/* @__PURE__ */ gfmFootnote()],
      toMarkdownExtensions: [
        /* @__PURE__ */ gfmFootnoteToMarkdown(),
        footnotesRootHandler,
      ],
    }),
  ],
  name: 'lexical-footnote/Mdast',
});
