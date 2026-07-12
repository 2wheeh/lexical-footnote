---
'lexical-footnote': minor
---

Copy now carries the notes a selection references — appended to `text/html`
as a GFM footnote section and to the Lexical JSON payload — so a cue pasted
elsewhere brings its text along. Paste re-keys a carried footnote whose id
names a different note in the target document, so a paste can never
overwrite an existing note; same-content pastes keep their id, so
cut-and-paste reconnects and multiple cues keep sharing one note.
