import type {ExportMimeTypeFunction} from '@lexical/clipboard';

import {
  $getEditor,
  $isElementNode,
  type LexicalNode,
  type SerializedElementNode,
  type SerializedLexicalNode,
} from 'lexical';

import {$getFootnoteDefinition} from '../model/definitions';
import {$computeFootnoteNumbers, orderFootnoteIds} from '../model/numbering';
import {$getDefinitionSlot} from '../model/slots';
import {createFootnoteId} from '../model/state';
import {
  $isFootnoteDefinitionNode,
  type FootnoteDefinitionNode,
} from '../nodes/FootnoteDefinitionNode';
import {
  $isFootnoteRefNode,
  type FootnoteRefNode,
} from '../nodes/FootnoteRefNode';
import {
  $buildFootnoteSectionDOM,
  $getFootnoteSection,
} from '../nodes/FootnoteSectionNode';

/**
 * Carrying notes with their cues across the clipboard.
 *
 * A definition is a slot value on the section, so a body selection holding a
 * cue never contains its note — both serializers (HTML and Lexical JSON) walk
 * only what the selection reaches, and the note stays behind. Pasting such a
 * payload into another document heals an empty placeholder: the cue survives,
 * the content is lost. These handlers append the referenced definitions to
 * each payload, and the paste side re-keys them when landing on a document
 * where the id already names a different note.
 */

/**
 * Footnote ids the selection references, in display-number order. Transitive
 * in the same way numbering is (see `$collectFootnoteRefs`): a carried note
 * may cite further notes, and a payload holding the note but not what it
 * cites would heal placeholders on paste just the same.
 */
function $collectReferencedFootnoteIds(
  nodes: readonly LexicalNode[],
): string[] {
  const cited: string[] = [];
  const seen = new Set<string>();
  const add = (footnoteId: string) => {
    if (footnoteId && !seen.has(footnoteId)) {
      seen.add(footnoteId);
      cited.push(footnoteId);
    }
  };
  for (const node of nodes) {
    if ($isFootnoteRefNode(node)) {
      add(node.getFootnoteId());
    }
  }
  // Grows while it is being iterated, like the numbering walk.
  for (let next = 0; next < cited.length; next++) {
    const definition = $getFootnoteDefinition(cited[next]!);
    if (definition) {
      walkTree(definition, node => {
        if ($isFootnoteRefNode(node)) {
          add(node.getFootnoteId());
        }
      });
    }
  }
  return orderFootnoteIds(cited, $computeFootnoteNumbers());
}

/** Depth-first over the children channel; works on detached subtrees. */
function walkTree(node: LexicalNode, visit: (node: LexicalNode) => void): void {
  visit(node);
  if ($isElementNode(node)) {
    for (const child of node.getChildren()) {
      walkTree(child, visit);
    }
  }
}

/**
 * `exportJSON` is shallow — the editor-state and clipboard serializers fill
 * `children` themselves — so a detached-subtree serializer has to recurse on
 * its own. Definitions host no slots (only the section does), so the children
 * channel is the whole subtree.
 */
function $serializeSubtree(node: LexicalNode): SerializedLexicalNode {
  const json = node.exportJSON();
  if ($isElementNode(node)) {
    (json as SerializedElementNode).children = node
      .getChildren()
      .map($serializeSubtree);
  }
  return json;
}

/**
 * `text/html` with the referenced notes appended as a GFM footnote section —
 * what GitHub emits, so our own importer and GitHub itself both read it back.
 * A payload that already holds a section (select-all reaches the section
 * node, whose exportDOM emits every note) is left alone.
 */
const $htmlWithFootnotes: ExportMimeTypeFunction = (selection, next) => {
  const html = next();
  if (html === null || selection === null) {
    return html;
  }
  const section = $getFootnoteSection();
  if (!section) {
    return html;
  }
  const footnoteIds = $collectReferencedFootnoteIds(
    selection.getNodes(),
  ).filter(footnoteId => $getDefinitionSlot(section, footnoteId) !== null);
  if (footnoteIds.length === 0) {
    return html;
  }
  const probe = document.createElement('div');
  probe.innerHTML = html;
  if (probe.querySelector('[data-footnotes]')) {
    return html;
  }
  return (
    html +
    $buildFootnoteSectionDOM($getEditor(), section, footnoteIds).outerHTML
  );
};

/**
 * `application/x-lexical-editor` with the referenced definitions appended as
 * top-level nodes. This MIME wins the paste priority race inside Lexical
 * editors, so without it the HTML payload never gets a chance there. The
 * pasted definitions land at the selection as ordinary nodes; `$defTransform`
 * slots them onto the section in the same update.
 */
const $lexicalJSONWithFootnotes: ExportMimeTypeFunction = (selection, next) => {
  const raw = next();
  if (raw === null || selection === null) {
    return raw;
  }
  const payload = JSON.parse(raw) as {
    namespace: string;
    nodes: SerializedLexicalNode[];
  };
  if (
    !Array.isArray(payload.nodes) ||
    // A selected section carries every note in its serialized $slots already.
    payload.nodes.some(node => node.type === 'footnote-section')
  ) {
    return raw;
  }
  const section = $getFootnoteSection();
  if (!section) {
    return raw;
  }
  const definitions = $collectReferencedFootnoteIds(selection.getNodes())
    .map(footnoteId => $getDefinitionSlot(section, footnoteId))
    .filter(
      (definition): definition is FootnoteDefinitionNode => definition !== null,
    );
  if (definitions.length === 0) {
    return raw;
  }
  payload.nodes.push(...definitions.map($serializeSubtree));
  return JSON.stringify(payload);
};

export const FootnoteExportMimeTypes = {
  'application/x-lexical-editor': [$lexicalJSONWithFootnotes],
  'text/html': [$htmlWithFootnotes],
};

/**
 * Re-keys pasted footnotes whose id already names a *different* note here.
 *
 * The id is the join key between a cue and its note, so what a paste means
 * depends on what the id resolves to in the target document:
 *
 * - no definition, or an empty placeholder → adopt the carried note (this is
 *   the reconnect that motivates the whole payload);
 * - same content → same footnote; keep the id so the cues share one note
 *   (cut/paste lands here, and GFM multi-ref is the point);
 * - different content → a different footnote that happens to share a name —
 *   two markdown documents both using `[^1]`. Without re-keying, the carried
 *   note would silently overwrite this document's note ($defTransform slots
 *   whatever content arrives). Fresh id, and the carried cues follow.
 *
 * Runs on SELECTION_INSERT_CLIPBOARD_NODES_COMMAND before insertion, so it
 * sees the parsed nodes of every clipboard route (JSON and HTML alike) and
 * mutates ids in place without owning the insertion itself.
 */
export function $remapCollidingFootnoteIds(
  nodes: readonly LexicalNode[],
): void {
  const refs: FootnoteRefNode[] = [];
  const definitions: FootnoteDefinitionNode[] = [];
  for (const node of nodes) {
    walkTree(node, visited => {
      if ($isFootnoteRefNode(visited)) {
        refs.push(visited);
      } else if ($isFootnoteDefinitionNode(visited)) {
        definitions.push(visited);
      }
    });
  }
  if (definitions.length === 0) {
    return;
  }
  const remapped = new Map<string, string>();
  for (const definition of definitions) {
    const footnoteId = definition.getFootnoteId();
    if (!footnoteId) {
      continue;
    }
    const existing = $getFootnoteDefinition(footnoteId);
    const existingContent = existing ? existing.getTextContent().trim() : '';
    const incomingContent = definition.getTextContent().trim();
    if (
      existing &&
      existingContent !== '' &&
      incomingContent !== '' &&
      existingContent !== incomingContent
    ) {
      const fresh = createFootnoteId();
      remapped.set(footnoteId, fresh);
      definition.setFootnoteId(fresh);
    }
  }
  if (remapped.size === 0) {
    return;
  }
  for (const ref of refs) {
    const fresh = remapped.get(ref.getFootnoteId());
    if (fresh) {
      ref.setFootnoteId(fresh);
    }
  }
}
