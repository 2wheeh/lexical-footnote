import {
  buildEditorFromExtensions,
  type LexicalEditorWithDispose,
} from '@lexical/extension';
import {$generateHtmlFromNodes} from '@lexical/html';
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $isElementNode,
  $nodesOfType,
} from 'lexical';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {
  $getFootnoteDefinition,
  FootnoteExtension,
} from '../../FootnoteExtension';
import {$createFootnoteRefNode, FootnoteRefNode} from '../../nodes/FootnoteRefNode';

/**
 * A footnote may be cited more than once: GFM keys definitions by identifier,
 * so many cues share one note. The link back is then one-to-many — the note
 * carries a backref per cue, and the nth backref leads to the nth cue.
 *
 * The contract is GitHub's, as `mdast-util-to-hast` renders it: the first cue
 * is `fnref-<id>` and repeats are suffixed (`fnref-<id>-2`), because otherwise
 * every cue for the note would carry the same DOM id; each backref beyond the
 * first shows its index (`↩` then `↩2`).
 */
describe('a footnote cited more than once', () => {
  let editor: LexicalEditorWithDispose;
  let container: HTMLElement;

  beforeEach(() => {
    editor = buildEditorFromExtensions({
      dependencies: [FootnoteExtension],
      name: 'test-root',
      namespace: 'test',
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    editor.setRootElement(container);
  });

  afterEach(() => {
    editor.dispose();
    container.remove();
  });

  /** `note` cited twice, then `other` once — so `note` is 1 and `other` is 2. */
  function seed(): void {
    editor.update(
      () => {
        $getRoot()
          .clear()
          .append(
            $createParagraphNode().append(
              $createTextNode('a'),
              $createFootnoteRefNode('note'),
              $createTextNode('b'),
              $createFootnoteRefNode('note'),
              $createTextNode('c'),
              $createFootnoteRefNode('other'),
            ),
          );
      },
      {discrete: true},
    );
    editor.update(
      () => {
        const paragraph = $getFootnoteDefinition('note')?.getFirstChild();
        if ($isElementNode(paragraph)) {
          paragraph.append($createTextNode('the note'));
        }
      },
      {discrete: true},
    );
  }

  /** The exported HTML, as a DOM — assertions on shape, not on string form. */
  function parse(html: string): HTMLElement {
    const host = document.createElement('div');
    host.innerHTML = html;
    return host;
  }

  it('gives every cue an id of its own', () => {
    seed();
    const html = editor.read(() => $generateHtmlFromNodes(editor));

    const cues = parse(html).querySelectorAll('[data-footnote-ref]');

    expect(Array.from(cues).map(cue => cue.id)).toEqual([
      'fnref-note',
      'fnref-note-2',
      'fnref-other',
    ]);
    // Every cue shows the note's number, not its own occurrence.
    expect(Array.from(cues).map(cue => cue.textContent)).toEqual([
      '1',
      '1',
      '2',
    ]);
  });

  it('exports one backref per cue, each pointing at its own cue', () => {
    seed();
    const html = editor.read(() => $generateHtmlFromNodes(editor));

    expect(html).toContain('href="#fnref-note"');
    expect(html).toContain('href="#fnref-note-2"');
    expect(html).toContain('aria-label="Back to reference 1"');
    expect(html).toContain('aria-label="Back to reference 1-2"');
    // The repeat backref carries its index; the first is a bare ↩.
    expect(html).toContain('↩<sup>2</sup>');
    // The note cited once keeps its single, unsuffixed backref.
    expect(html).toContain('href="#fnref-other"');
    expect(html).not.toContain('href="#fnref-other-2"');
  });

  it('names the section for a screen reader, as GFM does', () => {
    seed();
    const html = editor.read(() => $generateHtmlFromNodes(editor));

    // Every cue describes itself by the notes heading — a bare "1" says
    // nothing on its own — so the heading has to be exported with them.
    expect(html).toContain('<h2 id="footnote-label"');
    expect(html.match(/aria-describedby="footnote-label"/g)).toHaveLength(3);
    expect(html).toContain('class="data-footnote-backref"');
  });

  it('renders a backref button per cue, and drops one when a cue goes', () => {
    seed();
    expect(backrefLabels('note')).toEqual([
      'Back to reference 1',
      'Back to reference 1-2',
    ]);
    expect(backrefLabels('other')).toEqual(['Back to reference 2']);

    editor.update(() => $removeRefs('note', 1), {discrete: true});

    expect(backrefLabels('note')).toEqual(['Back to reference 1']);
  });

  /** Labels of the backrefs the overlay renders for a note, in order. */
  function backrefLabels(footnoteId: string): string[] {
    const group = document.querySelector(
      `.lexical-footnote__backrefs[data-footnote-id="${footnoteId}"]`,
    );
    return Array.from(group?.children ?? []).map(
      button => button.getAttribute('aria-label') ?? '',
    );
  }

  function $removeRefs(footnoteId: string, count: number): void {
    let removed = 0;
    for (const ref of $nodesOfType(FootnoteRefNode)) {
      if (ref.getFootnoteId() === footnoteId && removed < count) {
        ref.remove();
        removed += 1;
      }
    }
  }
});
