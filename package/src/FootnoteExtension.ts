import {signal} from '@lexical/extension';
import {
  CoreImportExtension,
  DOMImportExtension,
  DOMRenderExtension,
} from '@lexical/html';
import {mergeRegister} from '@lexical/utils';
import {configExtension, defineExtension, type LexicalEditor} from 'lexical';

import {FootnoteImportRules} from './io/htmlImport';
import {$cleanupOrphanFootnotes} from './model/definitions';
import {registerFootnoteDeletion} from './model/deletion';
import {INSERT_FOOTNOTE_COMMAND, registerFootnoteInsert} from './model/insert';
import {$computeFootnoteNumbers} from './model/numbering';
import {registerFootnoteTransforms} from './model/transforms';
import {FootnoteDefinitionNode} from './nodes/FootnoteDefinitionNode';
import {FootnoteRefNode} from './nodes/FootnoteRefNode';
import {
  FootnoteSectionNode,
  FootnoteSectionRenderOverride,
} from './nodes/FootnoteSectionNode';
import {registerFootnoteUI} from './ui';
import {gotoDefinition, gotoRef} from './ui/navigation';

export {INSERT_FOOTNOTE_COMMAND} from './model/insert';
export {$computeFootnoteNumbers, $getFootnoteRefs} from './model/numbering';
export {$getFootnoteSection} from './nodes/FootnoteSectionNode';
export {
  $cleanupOrphanFootnotes,
  $getFootnoteDefinition,
  $getFootnoteDefinitions,
  $getOrderedFootnoteIds,
  $removeFootnote,
  $removeFootnoteDefinition,
} from './model/definitions';

export interface FootnoteConfig {
  /**
   * Leave definitions nothing refers to out of the exported HTML, as GitHub
   * does when it renders. Off by default: this is a document editor, and an
   * orphan note is content the user wrote — dropping it from the model's own
   * serialization would be silent data loss. Turn it on when the HTML is a
   * rendering rather than a document, and you want parity with GitHub.
   *
   * Markdown export is unaffected either way. GFM permits an orphan definition
   * in the source; it is only the HTML rendering that discards it.
   */
  dropOrphansOnExport: boolean;
}

// Annotated, not `satisfies`: the latter would narrow the default to the
// literal `false`, and the config could then never be set to anything else.
const DEFAULT_CONFIG: FootnoteConfig = {dropOrphansOnExport: false};

function mapsEqual(
  a: ReadonlyMap<string, number>,
  b: ReadonlyMap<string, number>,
): boolean {
  if (a.size !== b.size) {
    return false;
  }
  for (const [k, v] of a) {
    if (b.get(k) !== v) {
      return false;
    }
  }
  return true;
}

/**
 * Wiring only. The parts it wires:
 *
 * - `model/` — the rules. Headless, all `$`-functions, no DOM: the definition
 *   map (slots), the derived numbering, the self-healing transforms, and the
 *   deletion policy.
 * - `ui/` — everything that needs a browser: the list items, the backref
 *   overlay, the keyboard routes.
 * - `io/` — the contracts with other worlds: GFM's HTML shape, and the
 *   importers for Word, Google Docs and GitHub.
 */
export const FootnoteExtension = defineExtension({
  config: DEFAULT_CONFIG,
  dependencies: [
    CoreImportExtension,
    /* @__PURE__ */ configExtension(DOMImportExtension, {
      rules: FootnoteImportRules,
    }),
    // Lets the reconciler attach each definition's slot container itself,
    // in-commit — no imperative mount racing it for the section's DOM.
    /* @__PURE__ */ configExtension(DOMRenderExtension, {
      overrides: [FootnoteSectionRenderOverride],
    }),
  ],
  build: (editor: LexicalEditor) => {
    const numbers = signal<ReadonlyMap<string, number>>(new Map());
    return {
      cleanupOrphans: (): boolean => {
        let removed = false;
        editor.update(
          () => {
            removed = $cleanupOrphanFootnotes();
          },
          {discrete: true},
        );
        return removed;
      },
      gotoDefinition: (footnoteId: string) =>
        gotoDefinition(editor, footnoteId),
      gotoRef: (footnoteId: string, occurrence?: number) =>
        gotoRef(editor, footnoteId, occurrence),
      insertFootnote: () =>
        editor.dispatchCommand(INSERT_FOOTNOTE_COMMAND, undefined),
      numbers,
    };
  },
  name: 'lexical-footnote/Footnote',
  nodes: () => [FootnoteRefNode, FootnoteSectionNode, FootnoteDefinitionNode],
  register: (editor, _config, state) => {
    const output = state.getOutput();
    return mergeRegister(
      registerFootnoteTransforms(editor),
      registerFootnoteDeletion(editor),
      registerFootnoteInsert(editor),
      registerFootnoteUI(editor),
      // Recompute on every update: dirty-set gating misses cues inside
      // wholesale subtree operations (clear, move, undo/redo's historic state
      // swaps), and mapsEqual keeps the signal referentially stable. Not a
      // mutation listener: those only fire with DOM reconciliation, which
      // never happens headless (tests, SSR, export workers).
      editor.registerUpdateListener(() => {
        const next = editor.read($computeFootnoteNumbers);
        if (!mapsEqual(next, output.numbers.peek())) {
          output.numbers.value = next;
        }
      }),
    );
  },
});
