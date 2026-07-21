---
'lexical-footnote': patch
---

Fix markdown (mdast) round-trip losing text format on footnote cues. Import now applies the surrounding emphasis/strong/delete context to the cue's format bitmask, and export re-wraps the cue per its format bits (emphasis innermost, matching core text serialization). A contributed to-markdown root handler folds adjacent same-type phrasing wrappers back together before serialization, so a formatted cue merges with neighboring same-format text (`**x[^a]**`) instead of serializing as the non-re-parseable `**x****[^a]**`.
