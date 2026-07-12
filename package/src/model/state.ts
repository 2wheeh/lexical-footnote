import {createState} from 'lexical';

/**
 * Stable footnote identifier shared by a FootnoteRefNode and its
 * FootnoteDefinitionNode. Doubles as the GFM identifier (`[^id]`) on
 * markdown round-trip, so it must stay label-safe (no spaces/brackets).
 */
export const footnoteIdState = createState('footnoteId', {
  parse: v => (typeof v === 'string' ? v : ''),
});

export function createFootnoteId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, b => (b % 36).toString(36)).join('');
}
