import {signal} from '@lexical/extension';
import {CoreImportExtension, DOMImportExtension} from '@lexical/html';
import {$dfs, mergeRegister} from '@lexical/utils';
import {
  $createParagraphNode,
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_EDITOR,
  configExtension,
  createCommand,
  defineExtension,
  registerEventListener,
  RootNode,
  type LexicalCommand,
  type LexicalEditor,
} from 'lexical';

import {
  $createFootnoteDefinitionNode,
  $isFootnoteDefinitionNode,
  FootnoteDefinitionNode,
} from './FootnoteDefinitionNode';
import {
  $createFootnoteRefNode,
  $isFootnoteRefNode,
  FootnoteRefNode,
} from './FootnoteRefNode';
import {
  $createFootnoteSectionNode,
  $isFootnoteSectionNode,
  FootnoteSectionNode,
} from './FootnoteSectionNode';
import {FootnoteImportRules} from './htmlImport';
import {createFootnoteId} from './state';

export const INSERT_FOOTNOTE_COMMAND: LexicalCommand<void> =
  /* @__PURE__ */ createCommand('INSERT_FOOTNOTE_COMMAND');

export function $getFootnoteSection(): FootnoteSectionNode | null {
  for (const child of $getRoot().getChildren()) {
    if ($isFootnoteSectionNode(child)) {
      return child;
    }
  }
  return null;
}

function $ensureFootnoteSection(): FootnoteSectionNode {
  const existing = $getFootnoteSection();
  if (existing) {
    return existing;
  }
  const section = $createFootnoteSectionNode();
  $getRoot().append(section);
  return section;
}

export function $getFootnoteDefinition(
  footnoteId: string,
): FootnoteDefinitionNode | null {
  const section = $getFootnoteSection();
  if (!section) {
    return null;
  }
  for (const child of section.getChildren()) {
    if (
      $isFootnoteDefinitionNode(child) &&
      child.getFootnoteId() === footnoteId
    ) {
      return child;
    }
  }
  return null;
}

export function $getFirstFootnoteRef(footnoteId: string): FootnoteRefNode | null {
  for (const {node} of $dfs()) {
    if ($isFootnoteRefNode(node) && node.getFootnoteId() === footnoteId) {
      return node;
    }
  }
  return null;
}

/**
 * Display numbers, derived from the document order of first references
 * (GFM numbering). Never stored on nodes.
 */
export function $computeFootnoteNumbers(): ReadonlyMap<string, number> {
  const numbers = new Map<string, number>();
  for (const {node} of $dfs()) {
    if ($isFootnoteRefNode(node)) {
      const id = node.getFootnoteId();
      if (id && !numbers.has(id)) {
        numbers.set(id, numbers.size + 1);
      }
    }
  }
  return numbers;
}

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

function $insertFootnote(): void {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) {
    return;
  }
  const id = createFootnoteId();
  selection.insertNodes([$createFootnoteRefNode(id)]);
  const section = $ensureFootnoteSection();
  const definition = $createFootnoteDefinitionNode(id);
  const paragraph = $createParagraphNode();
  definition.append(paragraph);
  section.append(definition);
  paragraph.selectStart();
}

function $scrollToKey(editor: LexicalEditor, key: string): void {
  const dom = editor.getElementByKey(key);
  if (dom && typeof dom.scrollIntoView === 'function') {
    dom.scrollIntoView({behavior: 'smooth', block: 'nearest'});
  }
}

function gotoDefinition(editor: LexicalEditor, footnoteId: string): void {
  editor.update(
    () => {
      const definition = $getFootnoteDefinition(footnoteId);
      if (definition) {
        definition.selectStart();
        $scrollToKey(editor, definition.getKey());
      }
    },
    {tag: 'footnote-navigation'},
  );
}

function gotoRef(editor: LexicalEditor, footnoteId: string): void {
  editor.update(
    () => {
      const ref = $getFirstFootnoteRef(footnoteId);
      if (ref) {
        ref.selectEnd();
        $scrollToKey(editor, ref.getKey());
      }
    },
    {tag: 'footnote-navigation'},
  );
}

/** Dangling ref (no definition) heals itself by creating one. */
function $refTransform(node: FootnoteRefNode): void {
  const id = node.getFootnoteId();
  if (!id) {
    node.remove();
    return;
  }
  if (!$getFootnoteDefinition(id)) {
    const definition = $createFootnoteDefinitionNode(id);
    definition.append($createParagraphNode());
    $ensureFootnoteSection().append(definition);
  }
}

function $defTransform(node: FootnoteDefinitionNode): void {
  if (!node.getFootnoteId()) {
    node.remove();
    return;
  }
  const parent = node.getParent();
  if (!$isFootnoteSectionNode(parent)) {
    $ensureFootnoteSection().append(node);
    return;
  }
  if (node.isEmpty()) {
    node.append($createParagraphNode());
  }
}

function $sectionTransform(node: FootnoteSectionNode): void {
  if (!node.isAttached()) {
    return;
  }
  const root = $getRoot();
  // Single section: merge later duplicates into the first one.
  const sections = root.getChildren().filter($isFootnoteSectionNode);
  const survivor = sections[0];
  if (survivor && node !== survivor) {
    for (const child of node.getChildren()) {
      survivor.append(child);
    }
    node.remove();
    return;
  }
  if (node.getParent() !== root) {
    root.append(node);
    return;
  }
  if (node.isEmpty()) {
    node.remove();
    return;
  }
  if (root.getLastChild() !== node) {
    root.append(node);
  }
  // Order definitions to match first-reference order; orphans keep their
  // relative order at the end (GFM keeps unreferenced definitions).
  const numbers = $computeFootnoteNumbers();
  const definitions = node.getChildren().filter($isFootnoteDefinitionNode);
  const desired = [...definitions].sort((a, b) => {
    const an = numbers.get(a.getFootnoteId()) ?? Number.MAX_SAFE_INTEGER;
    const bn = numbers.get(b.getFootnoteId()) ?? Number.MAX_SAFE_INTEGER;
    return an - bn;
  });
  if (desired.some((def, i) => def !== definitions[i])) {
    for (const def of desired) {
      node.append(def);
    }
  }
}

/** Keep the section pinned as the last child of the root. */
function $rootTransform(node: RootNode): void {
  const section = $getFootnoteSection();
  if (section && node.getLastChild() !== section) {
    node.append(section);
  }
}

export const FootnoteExtension = defineExtension({
  dependencies: [
    CoreImportExtension,
    /* @__PURE__ */ configExtension(DOMImportExtension, {
      rules: FootnoteImportRules,
    }),
  ],
  build: (editor: LexicalEditor) => {
    const numbers = signal<ReadonlyMap<string, number>>(new Map());
    return {
      gotoDefinition: (footnoteId: string) =>
        gotoDefinition(editor, footnoteId),
      gotoRef: (footnoteId: string) => gotoRef(editor, footnoteId),
      insertFootnote: () =>
        editor.dispatchCommand(INSERT_FOOTNOTE_COMMAND, undefined),
      numbers,
    };
  },
  name: 'lexical-footnote/Footnote',
  nodes: () => [FootnoteRefNode, FootnoteSectionNode, FootnoteDefinitionNode],
  register: (editor, _config, state) => {
    const output = state.getOutput();
    const recomputeNumbers = () => {
      const next = editor.read($computeFootnoteNumbers);
      if (!mapsEqual(next, output.numbers.peek())) {
        output.numbers.value = next;
      }
    };
    const onRootClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      const backref = target.closest('[data-lexical-footnote-backref]');
      if (!backref) {
        return;
      }
      const footnoteId = backref
        .closest('[data-lexical-footnote-def]')
        ?.getAttribute('data-lexical-footnote-def');
      if (footnoteId) {
        event.preventDefault();
        output.gotoRef(footnoteId);
      }
    };
    let removeRootClick: (() => void) | null = null;
    return mergeRegister(
      () => removeRootClick?.(),
      editor.registerRootListener(rootElement => {
        removeRootClick?.();
        removeRootClick = rootElement
          ? registerEventListener(rootElement, 'click', onRootClick)
          : null;
      }),
      editor.registerCommand(
        INSERT_FOOTNOTE_COMMAND,
        () => {
          $insertFootnote();
          return true;
        },
        COMMAND_PRIORITY_EDITOR,
      ),
      // Not a mutation listener: those only fire with DOM reconciliation,
      // which never happens in headless usage (tests, SSR, export workers).
      editor.registerUpdateListener(
        ({dirtyLeaves, editorState, prevEditorState}) => {
          if (dirtyLeaves.size === 0) {
            return;
          }
          const $hasDirtyRef = () => {
            for (const key of dirtyLeaves) {
              if ($isFootnoteRefNode($getNodeByKey(key))) {
                return true;
              }
            }
            return false;
          };
          if (
            editorState.read($hasDirtyRef) ||
            prevEditorState.read($hasDirtyRef)
          ) {
            recomputeNumbers();
          }
        },
      ),
      editor.registerNodeTransform(FootnoteRefNode, $refTransform),
      editor.registerNodeTransform(FootnoteDefinitionNode, $defTransform),
      editor.registerNodeTransform(FootnoteSectionNode, $sectionTransform),
      editor.registerNodeTransform(RootNode, $rootTransform),
    );
  },
});
