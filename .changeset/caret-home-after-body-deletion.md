---
'lexical-footnote': patch
---

Fixed an unrecoverable editor state: deleting the whole body when footnotes
existed (e.g. select-all + backspace, which removes the last paragraph as a
block) could leave the footnote section as the root's only child — a
non-editable shell with no caret position anywhere, so typing became
impossible. The root transform now guarantees a body paragraph next to the
section and restores the caret when the deletion left it pointing at
removed nodes; the empty-body policy then converges to the same end state
as an ordinary select-all delete (section discarded, one undo restores
everything).
