import {
  $insertGeneratedNodes,
  ClipboardImportExtension,
} from '@lexical/clipboard';
import {
  $generateNodesFromDOMViaExtension,
  contextValue,
  ImportSource,
  ImportSourceDataTransfer,
} from '@lexical/html';
import {$getEditor, configExtension, defineExtension} from 'lexical';

import {FootnoteExtension} from './FootnoteExtension';

/**
 * Routes `text/html` pastes through the DOMImportExtension pipeline so the
 * footnote import rules (our own HTML, GitHub's GFM output, Word, Google
 * Docs) apply to real clipboard pastes — the default clipboard path uses
 * the legacy static-importDOM converter, which never sees rule-based
 * imports. Opt-in and separate from the core FootnoteExtension because it
 * reroutes ALL html pastes for the editor, not just footnote content.
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
  ],
  name: 'lexical-footnote/Clipboard',
});
