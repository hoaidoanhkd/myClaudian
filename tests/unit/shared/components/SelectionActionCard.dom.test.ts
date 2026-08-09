/**
 * @jest-environment jsdom
 */

import {
  SelectionActionCard,
} from '@/shared/components/SelectionActionCard';

const anchor = {
  top: 120,
  right: 180,
  bottom: 140,
  left: 100,
  width: 80,
  height: 20,
  x: 100,
  y: 120,
  toJSON: () => ({}),
} as DOMRect;

describe('SelectionActionCard', () => {
  let card: SelectionActionCard;

  beforeEach(() => {
    card = new SelectionActionCard(document);
  });

  afterEach(() => {
    card.destroy();
    document.body.innerHTML = '';
  });

  it('replaces processing content with the final answer', () => {
    const onCancel = jest.fn();
    card.showProcessing({ anchor, message: 'Thinking…', onCancel });
    expect(card.getElement()?.textContent).toContain('Thinking…');
    expect(card.getElement()?.style.left).toBe('100px');
    card.getElement()?.querySelector<HTMLButtonElement>('[data-selection-action="cancel"]')?.click();
    expect(onCancel).toHaveBeenCalledTimes(1);

    const onCopy = jest.fn();
    card.showAnswer({ anchor, answer: 'A concise answer.', onCopy });
    expect(card.getElement()?.textContent).toContain('A concise answer.');
    expect(card.getElement()?.querySelector('[data-selection-action="dismiss"]')).not.toBeNull();
    card.getElement()?.querySelector<HTMLButtonElement>('[data-selection-action="copy"]')?.click();
    expect(onCopy).toHaveBeenCalledTimes(1);

  });

  it('hides and destroys its element', () => {
    card.showProcessing({ anchor });
    card.hide();
    expect(card.isVisible()).toBe(false);

    card.destroy();
    expect(card.getElement()).toBeNull();
  });
});
