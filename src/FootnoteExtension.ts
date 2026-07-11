import {defineExtension} from 'lexical';

/**
 * Core footnote extension. M0: wiring placeholder — nodes, commands,
 * numbering, and structural invariants land in M1.
 */
export const FootnoteExtension = defineExtension({
  name: 'lexical-footnote/Footnote',
});
