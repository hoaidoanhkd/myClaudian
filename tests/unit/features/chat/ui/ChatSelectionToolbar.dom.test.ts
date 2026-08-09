/**
 * @jest-environment jsdom
 */

import { ChatSelectionToolbar } from '../../../../../src/features/chat/ui/ChatSelectionToolbar';

describe('ChatSelectionToolbar', () => {
  let containerEl: HTMLElement;

  beforeEach(() => {
    containerEl = document.createElement('div');
    document.body.appendChild(containerEl);
  });

  afterEach(() => {
    containerEl?.remove();
    document.body.innerHTML = '';
  });

  it('can be instantiated and destroyed without error', () => {
    const onExplain = jest.fn();
    const onRefine = jest.fn();

    const toolbar = new ChatSelectionToolbar(containerEl, { onExplain, onRefine });
    expect(toolbar).toBeDefined();

    toolbar.destroy();
  });
});
