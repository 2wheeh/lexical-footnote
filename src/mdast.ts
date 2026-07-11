import type {
  MdastExportHandler,
  MdastImportHandler,
} from '@lexical/mdast';
import type {
  BlockContent,
  DefinitionContent,
  FootnoteDefinition,
  FootnoteReference,
} from 'mdast';

import {MdastImportExtension} from '@lexical/mdast';
import {
  gfmFootnoteFromMarkdown,
  gfmFootnoteToMarkdown,
} from 'mdast-util-gfm-footnote';
import {configExtension, defineExtension} from 'lexical';
import {gfmFootnote} from 'micromark-extension-gfm-footnote';

import {
  $createFootnoteDefinitionNode,
  FootnoteDefinitionNode,
} from './FootnoteDefinitionNode';
import {FootnoteExtension} from './FootnoteExtension';
import {$createFootnoteRefNode, FootnoteRefNode} from './FootnoteRefNode';
import {FootnoteSectionNode} from './FootnoteSectionNode';

const $importFootnoteReference: MdastImportHandler<FootnoteReference> =
  node => {
    return node.identifier ? $createFootnoteRefNode(node.identifier) : null;
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
  // The FootnoteExtension transforms relocate this into the section and
  // order it by first reference, wherever the markdown declared it.
  return definition;
};

const $exportFootnoteRef: MdastExportHandler<FootnoteRefNode> = node => {
  const identifier = node.getFootnoteId();
  return identifier
    ? {identifier, label: identifier, type: 'footnoteReference'}
    : null;
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

/** The section is invisible in markdown: it flattens to its definitions. */
const $exportFootnoteSection: MdastExportHandler<FootnoteSectionNode> = (
  node,
  ctx,
) => {
  return ctx.exportChildren(node);
};

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
      toMarkdownExtensions: [/* @__PURE__ */ gfmFootnoteToMarkdown()],
    }),
  ],
  name: 'lexical-footnote/Mdast',
});
