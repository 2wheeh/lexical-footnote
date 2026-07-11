import {mergeRegister} from '@lexical/utils';
import {registerEventListener, type LexicalEditor} from 'lexical';

import {BackrefOverlay} from './backrefs';
import {registerFootnoteKeyboard} from './keyboard';
import {syncSectionList} from './sectionList';

/**
 * Everything the footnotes need from a browser: the list items, the backref
 * overlay, and the keyboard routes. All of it hangs off the root element, so
 * all of it is rebuilt when the root element changes and torn down when the
 * editor goes.
 *
 * Structure is derived on commit, where the model is the truth. Only the
 * overlay's *position* waits for a frame, because that is the only part that
 * needs layout.
 */
export function registerFootnoteUI(editor: LexicalEditor): () => void {
  const overlay = new BackrefOverlay(editor);
  let currentRoot: HTMLElement | null = null;
  let removeRootHandlers: (() => void) | null = null;

  const scheduleReposition = () => {
    const rootElement = currentRoot;
    if (!rootElement) {
      return;
    }
    const run = () => {
      if (currentRoot === rootElement) {
        overlay.position(rootElement);
      }
    };
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(run);
    } else {
      run();
    }
  };

  return mergeRegister(
    () => {
      removeRootHandlers?.();
      overlay.detach();
    },
    editor.registerRootListener(rootElement => {
      removeRootHandlers?.();
      removeRootHandlers = null;
      overlay.detach();
      currentRoot = rootElement;
      if (!rootElement) {
        return;
      }
      overlay.attach(rootElement);
      syncSectionList(editor);
      overlay.sync();
      overlay.position(rootElement);
      removeRootHandlers = mergeRegister(
        registerFootnoteKeyboard(editor, rootElement, overlay),
        typeof window !== 'undefined'
          ? registerEventListener(window, 'resize', () =>
              overlay.position(rootElement),
            )
          : () => {},
      );
    }),
    editor.registerUpdateListener(() => {
      syncSectionList(editor);
      overlay.sync();
      scheduleReposition();
    }),
  );
}
