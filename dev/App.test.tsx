import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeAll, describe, expect, it} from 'vitest';

import {App} from './App';

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});

describe('dev App', () => {
  it('renders the editor', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await act(async () => {
      createRoot(container).render(<App />);
    });
    expect(container.querySelector('[contenteditable="true"]')).toBeTruthy();
  });
});
