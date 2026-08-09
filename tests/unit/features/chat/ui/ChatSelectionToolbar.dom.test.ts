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

  it('shows the shared processing card immediately and ignores a result after dismissal', async () => {
    let resolveExplanation: ((value: string) => void) | undefined;
    const onExplain = jest.fn(() => new Promise<string>((resolve) => {
      resolveExplanation = resolve;
    }));
    const toolbar = new ChatSelectionToolbar(containerEl, {
      onExplain,
      onRefine: jest.fn(),
    });
    const selectedEl = containerEl.createSpan({ text: 'Selected message text' });
    const range = document.createRange();
    range.selectNodeContents(selectedEl);
    Object.defineProperty(range, 'getBoundingClientRect', {
      value: () => ({ left: 100, top: 100, right: 220, bottom: 120, width: 120, height: 20 }),
    });
    Object.defineProperty(containerEl, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, right: 500, bottom: 500, width: 500, height: 500 }),
    });
    const selection = document.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));

    (containerEl.querySelector('[aria-label="Giải thích đoạn này"]') as HTMLButtonElement).click();
    expect(document.body.textContent).toContain('Focusing...');

    const dismissButton = document.querySelector('[data-selection-action="cancel"]') as HTMLButtonElement;
    dismissButton.click();
    resolveExplanation?.('This result should stay hidden.');
    await Promise.resolve();

    expect(document.body.textContent).not.toContain('This result should stay hidden.');
    toolbar.destroy();
  });
});
