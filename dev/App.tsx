import {AutoFocusExtension} from '@lexical/extension';
import {HistoryExtension} from '@lexical/history';
import {LexicalExtensionComposer} from '@lexical/react/LexicalExtensionComposer';
import {TreeViewExtension} from '@lexical/react/TreeViewExtension';
import {ExtensionComponent} from '@lexical/react/ExtensionComponent';
import {RichTextExtension} from '@lexical/rich-text';
import {defineExtension} from 'lexical';

import {FootnoteExtension} from '../src';

const appExtension = defineExtension({
  dependencies: [
    RichTextExtension,
    AutoFocusExtension,
    HistoryExtension,
    TreeViewExtension,
    FootnoteExtension,
  ],
  name: 'lexical-footnote/dev',
  namespace: 'lexical-footnote-dev',
});

export function App() {
  return (
    <main>
      <h1>lexical-footnote</h1>
      <LexicalExtensionComposer extension={appExtension}>
        <ExtensionComponent lexical:extension={TreeViewExtension} />
      </LexicalExtensionComposer>
    </main>
  );
}
