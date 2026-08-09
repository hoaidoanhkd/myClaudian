/**
 * @jest-environment jsdom
 */

import { EditorNoteSelectionPopover } from '@/features/chat/ui/EditorNoteSelectionPopover';

jest.mock('obsidian', () => ({
  setIcon: jest.fn(),
}));

describe('EditorNoteSelectionPopover', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('preserves the editor selection while an action button is pressed', () => {
    const onExplain = jest.fn();
    const onDismiss = jest.fn();
    const popover = new EditorNoteSelectionPopover({
      onExplain,
      onRefine: jest.fn(),
      onDismiss,
    });

    popover.show('selected passage', {
      left: 100,
      top: 100,
      right: 200,
      bottom: 120,
      width: 100,
      height: 20,
    } as DOMRect);

    const explainButton = document.querySelector('.claudian-note-popover-btn') as HTMLButtonElement;
    const pointerDown = new Event('pointerdown', { bubbles: true, cancelable: true });
    const mouseDown = new Event('mousedown', { bubbles: true, cancelable: true });
    explainButton.dispatchEvent(pointerDown);
    explainButton.dispatchEvent(mouseDown);
    explainButton.click();

    expect(pointerDown.defaultPrevented).toBe(true);
    expect(mouseDown.defaultPrevented).toBe(true);
    expect(onExplain).toHaveBeenCalledWith('selected passage');
    expect(onDismiss).not.toHaveBeenCalled();
  });
});
