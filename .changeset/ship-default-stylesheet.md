---
'lexical-footnote': minor
---

The package now ships a default stylesheet, `lexical-footnote/styles.css` —
the out-of-the-box look for the footnote anatomy (superscript cues, the
short separator rule, the numbered notes list, `↩` backrefs). Host-agnostic:
it inherits the host's typography and colors, sizes in `em`, and works on
any light or dark background with zero configuration. Themeable via
optional `--lexical-footnote-*` custom properties (accent,
accent-contrast, note-color, rule-color); styling the class names yourself
without the stylesheet remains fully supported.
