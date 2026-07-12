import {
  $insertGeneratedNodes,
  ClipboardImportExtension,
  GetClipboardDataExtension,
} from '@lexical/clipboard';
import {
  $generateNodesFromDOMViaExtension,
  contextValue,
  ImportSource,
  ImportSourceDataTransfer,
} from '@lexical/html';
import {
  $getEditor,
  COMMAND_PRIORITY_CRITICAL,
  configExtension,
  defineExtension,
  SELECTION_INSERT_CLIPBOARD_NODES_COMMAND,
} from 'lexical';

import {FootnoteExtension} from './FootnoteExtension';
import {
  $remapCollidingFootnoteIds,
  FootnoteExportMimeTypes,
} from './io/clipboardCarry';

/**
 * The clipboard contract, both directions. Opt-in and separate from the core
 * FootnoteExtension because the import side reroutes ALL html pastes for the
 * editor, not just footnote content.
 *
 * - Paste: routes `text/html` through the DOMImportExtension pipeline so the
 *   footnote import rules (our own HTML, GitHub's GFM output, Word, Google
 *   Docs) apply to real clipboard pastes — the default clipboard path uses
 *   the legacy static-importDOM converter, which never sees rule-based
 *   imports.
 * - Copy: appends the notes a selection references to the `text/html` and
 *   `application/x-lexical-editor` payloads — a cue's note is a slot value,
 *   which no selection can contain, so without this a pasted cue heals an
 *   empty placeholder and the content stays behind.
 * - Paste, again: re-keys carried footnotes whose id names a different note
 *   in the target document, so a paste can never overwrite an existing note.
 */
export const FootnoteClipboardExtension = /* @__PURE__ */ defineExtension({
  dependencies: [
    FootnoteExtension,
    /* @__PURE__ */ configExtension(ClipboardImportExtension, {
      $importMimeType: {
        'text/html': [
          (html, selection, _$next, dataTransfer) => {
            const dom = new DOMParser().parseFromString(html, 'text/html');
            const nodes = $generateNodesFromDOMViaExtension(dom, {
              context: [
                contextValue(ImportSource, 'paste'),
                contextValue(ImportSourceDataTransfer, dataTransfer),
              ],
            });
            $insertGeneratedNodes($getEditor(), nodes, selection);
            return true;
          },
        ],
      },
    }),
    /* @__PURE__ */ configExtension(GetClipboardDataExtension, {
      $exportMimeType: FootnoteExportMimeTypes,
    }),
  ],
  name: 'lexical-footnote/Clipboard',
  register: editor =>
    editor.registerCommand(
      SELECTION_INSERT_CLIPBOARD_NODES_COMMAND,
      ({nodes}) => {
        // Rewrites ids in place and declines the command, so whichever
        // handler owns the insertion inserts the re-keyed nodes.
        $remapCollidingFootnoteIds(nodes);
        return false;
      },
      COMMAND_PRIORITY_CRITICAL,
    ),
});
