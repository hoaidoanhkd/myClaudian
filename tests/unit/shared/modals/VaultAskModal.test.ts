import { createMockEl } from '@test/helpers/MockElement';

import {
  VaultAskModal,
  type VaultAskModalCallbacks,
  type VaultAskResult,
} from '@/shared/modals/VaultAskModal';

function createMockCallbacks(
  overrides: Partial<VaultAskModalCallbacks> = {}
): VaultAskModalCallbacks {
  return {
    onAsk: jest.fn().mockResolvedValue({ answer: 'Answer', success: true }),
    onCancel: jest.fn(),
    ...overrides,
  };
}

function openModal(callbacks: VaultAskModalCallbacks): VaultAskModal {
  const modal = new VaultAskModal({} as any, callbacks);
  (modal as any).setTitle = jest.fn();
  (modal as any).contentEl = createMockEl();
  (modal as any).close = jest.fn();
  VaultAskModal.prototype.onOpen.call(modal);
  return modal;
}

function findByClass(root: any, cls: string): any {
  if (root.hasClass?.(cls)) return root;
  for (const child of root.children || []) {
    const found = findByClass(child, cls);
    if (found) return found;
  }
  return null;
}

function askQuestion(modal: VaultAskModal, question: string): void {
  (modal as any).questionInput.setValue(question);
}

describe('VaultAskModal', () => {
  describe('onOpen', () => {
    it('renders a question label, a hint, a hidden answer area, and an Ask button', () => {
      const modal = openModal(createMockCallbacks());
      const contentEl = (modal as any).contentEl;

      expect(findByClass(contentEl, 'claudian-vault-ask-label').textContent).toBe('Your question');
      expect(findByClass(contentEl, 'claudian-vault-ask-hint')).not.toBeNull();

      const answerEl = findByClass(contentEl, 'claudian-vault-ask-answer');
      expect(answerEl.hasClass('claudian-hidden')).toBe(true);

      const loadingEl = findByClass(contentEl, 'claudian-vault-ask-loading');
      expect(loadingEl.hasClass('claudian-hidden')).toBe(true);

      const answerTextEl = findByClass(contentEl, 'claudian-vault-ask-answer-text');
      expect(answerTextEl.hasClass('claudian-hidden')).toBe(true);

      const askBtn = findByClass(contentEl, 'claudian-vault-ask-ask-btn');
      expect(askBtn.textContent).toBe('Ask');
    });
  });

  describe('submit', () => {
    it('does nothing when the question is empty', async () => {
      const callbacks = createMockCallbacks();
      const modal = openModal(callbacks);
      const contentEl = (modal as any).contentEl;

      findByClass(contentEl, 'claudian-vault-ask-ask-btn').click();
      await Promise.resolve();

      expect(callbacks.onAsk).not.toHaveBeenCalled();
    });

    it('disables the Ask button and shows a busy label while a question is in flight', async () => {
      let resolveAsk: (result: VaultAskResult) => void = () => undefined;
      const onAsk = jest.fn(
        () =>
          new Promise<VaultAskResult>(resolve => {
            resolveAsk = resolve;
          }),
      );
      const callbacks = createMockCallbacks({ onAsk });
      const modal = openModal(callbacks);
      const contentEl = (modal as any).contentEl;
      askQuestion(modal, 'What is the roadmap?');

      const askBtn = findByClass(contentEl, 'claudian-vault-ask-ask-btn');
      askBtn.click();
      await Promise.resolve();

      expect(askBtn.getAttribute('disabled')).toBe('true');
      expect(askBtn.textContent).toBe('Asking...');

      resolveAsk({ answer: 'Final answer', success: true });
      await Promise.resolve();
      await Promise.resolve();

      expect(askBtn.getAttribute('disabled')).toBeNull();
      expect(askBtn.textContent).toBe('Ask');
    });

    it('shows a loading indicator until the first token arrives, then streams the answer', async () => {
      let progressCallback: (text: string) => void = () => undefined;
      let resolveAsk: (result: VaultAskResult) => void = () => undefined;
      const onAsk = jest.fn((_question: string, onProgress: (text: string) => void) => {
        progressCallback = onProgress;
        return new Promise<VaultAskResult>(resolve => {
          resolveAsk = resolve;
        });
      });
      const callbacks = createMockCallbacks({ onAsk });
      const modal = openModal(callbacks);
      const contentEl = (modal as any).contentEl;
      askQuestion(modal, 'What is the roadmap?');

      findByClass(contentEl, 'claudian-vault-ask-ask-btn').click();
      await Promise.resolve();

      const answerEl = findByClass(contentEl, 'claudian-vault-ask-answer');
      const loadingEl = findByClass(contentEl, 'claudian-vault-ask-loading');
      const answerTextEl = findByClass(contentEl, 'claudian-vault-ask-answer-text');

      expect(answerEl.hasClass('claudian-hidden')).toBe(false);
      expect(loadingEl.hasClass('claudian-hidden')).toBe(false);
      expect(answerTextEl.hasClass('claudian-hidden')).toBe(true);

      progressCallback('Partial answer');

      expect(loadingEl.hasClass('claudian-hidden')).toBe(true);
      expect(answerTextEl.hasClass('claudian-hidden')).toBe(false);
      expect(answerTextEl.textContent).toBe('Partial answer');

      resolveAsk({ answer: 'Final answer', success: true });
      await Promise.resolve();
      await Promise.resolve();

      expect(answerTextEl.textContent).toBe('Final answer');
    });

    it('shows the error message when the query fails', async () => {
      const callbacks = createMockCallbacks({
        onAsk: jest.fn().mockResolvedValue({ error: 'No answer was returned.', success: false }),
      });
      const modal = openModal(callbacks);
      const contentEl = (modal as any).contentEl;
      askQuestion(modal, 'What is the roadmap?');

      findByClass(contentEl, 'claudian-vault-ask-ask-btn').click();
      await Promise.resolve();
      await Promise.resolve();

      const answerTextEl = findByClass(contentEl, 'claudian-vault-ask-answer-text');
      expect(answerTextEl.hasClass('claudian-hidden')).toBe(false);
      expect(answerTextEl.textContent).toBe('No answer was returned.');
    });
  });

  describe('onClose', () => {
    it('calls onCancel when closed while a question is in flight', async () => {
      const onAsk = jest.fn(() => new Promise<VaultAskResult>(() => undefined));
      const callbacks = createMockCallbacks({ onAsk });
      const modal = openModal(callbacks);
      askQuestion(modal, 'What is the roadmap?');

      findByClass((modal as any).contentEl, 'claudian-vault-ask-ask-btn').click();
      await Promise.resolve();

      VaultAskModal.prototype.onClose.call(modal);

      expect(callbacks.onCancel).toHaveBeenCalled();
    });

    it('does not call onCancel when closed idle', () => {
      const callbacks = createMockCallbacks();
      const modal = openModal(callbacks);

      VaultAskModal.prototype.onClose.call(modal);

      expect(callbacks.onCancel).not.toHaveBeenCalled();
    });
  });
});
