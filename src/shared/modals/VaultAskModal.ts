/**
 * Claudian - Ask across vault modal
 *
 * A lightweight, provider-agnostic dialog for a single vault-wide question.
 * The modal only renders UI and forwards actions through callbacks; the
 * caller (composition root) is responsible for resolving the provider and
 * running the actual query.
 */

import type { App, Component } from 'obsidian';
import { MarkdownRenderer, Modal, TextAreaComponent } from 'obsidian';

export interface VaultAskResult {
  success: boolean;
  answer?: string;
  error?: string;
}

export interface VaultAskModalCallbacks {
  onAsk: (
    question: string,
    onProgress: (accumulatedText: string) => void,
  ) => Promise<VaultAskResult>;
  onCancel: () => void;
}

export class VaultAskModal extends Modal {
  private questionInput: TextAreaComponent | null = null;
  private answerEl: HTMLElement | null = null;
  private loadingEl: HTMLElement | null = null;
  private answerTextEl: HTMLElement | null = null;
  private askBtnEl: HTMLButtonElement | null = null;
  private isAsking = false;

  constructor(
    app: App,
    private readonly component: Component,
    private readonly callbacks: VaultAskModalCallbacks,
  ) {
    super(app);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.addClass('claudian-vault-ask-modal');
    this.setTitle('Ask across vault');

    const inputSection = contentEl.createDiv({ cls: 'claudian-vault-ask-section' });
    inputSection.createDiv({ cls: 'claudian-vault-ask-label', text: 'Your question' });

    this.questionInput = new TextAreaComponent(inputSection);
    this.questionInput.inputEl.addClass('claudian-vault-ask-input');
    this.questionInput.inputEl.rows = 3;
    this.questionInput.inputEl.placeholder = 'Ask a question about your vault...';
    this.questionInput.inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
      // Check !e.isComposing for IME support (Chinese, Japanese, Korean, etc.)
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !this.isAsking) {
        e.preventDefault();
        void this.submit();
      }
    });

    inputSection.createDiv({
      cls: 'claudian-vault-ask-hint',
      text: 'Enter to ask · Shift+Enter for a new line',
    });

    this.answerEl = contentEl.createDiv({ cls: 'claudian-vault-ask-answer' });
    this.answerEl.addClass('claudian-hidden');

    this.loadingEl = this.answerEl.createDiv({ cls: 'claudian-vault-ask-loading' });
    this.loadingEl.createDiv({ cls: 'claudian-vault-ask-spinner' });
    this.loadingEl.createSpan({ text: 'Searching your vault...' });
    this.loadingEl.addClass('claudian-hidden');

    this.answerTextEl = this.answerEl.createDiv({ cls: 'claudian-vault-ask-answer-text' });
    this.answerTextEl.addClass('claudian-hidden');

    const buttonsEl = contentEl.createDiv({ cls: 'claudian-vault-ask-buttons' });
    this.askBtnEl = buttonsEl.createEl('button', {
      attr: { 'aria-label': 'Ask' },
      cls: 'claudian-vault-ask-btn claudian-vault-ask-ask-btn',
      text: 'Ask',
    });
    this.askBtnEl.addEventListener('click', () => void this.submit());

    this.questionInput.inputEl.focus();
  }

  private async submit() {
    const question = this.questionInput?.getValue().trim();
    if (!question || this.isAsking) return;

    this.isAsking = true;
    this.askBtnEl?.setAttribute('disabled', 'true');
    this.askBtnEl?.setText('Asking...');
    this.answerEl?.removeClass('claudian-hidden');
    this.loadingEl?.removeClass('claudian-hidden');
    this.answerTextEl?.addClass('claudian-hidden');
    this.answerTextEl?.setText('');

    let hasStreamed = false;
    // While streaming, show plain accumulated text: re-rendering markdown on
    // every delta is wasteful and can flash broken HTML on a mid-token cut.
    const showStreamingText = (text: string) => {
      if (!hasStreamed) {
        hasStreamed = true;
        this.loadingEl?.addClass('claudian-hidden');
        this.answerTextEl?.removeClass('claudian-hidden');
      }
      this.answerTextEl?.setText(text);
    };

    try {
      const result = await this.callbacks.onAsk(question, showStreamingText);
      if (result.success && result.answer) {
        await this.renderFinalAnswer(result.answer);
      } else {
        showStreamingText(result.error ?? 'Unable to answer the question.');
      }
    } catch (error) {
      showStreamingText(error instanceof Error ? error.message : 'Unable to answer the question.');
    } finally {
      this.isAsking = false;
      this.askBtnEl?.removeAttribute('disabled');
      this.askBtnEl?.setText('Ask');
    }
  }

  private async renderFinalAnswer(markdown: string): Promise<void> {
    const container = this.answerTextEl;
    if (!container) return;

    this.loadingEl?.addClass('claudian-hidden');
    container.removeClass('claudian-hidden');
    container.empty();

    try {
      await MarkdownRenderer.render(this.app, markdown, container, '', this.component);
    } catch {
      container.empty();
      container.setText(markdown);
    }
  }

  onClose() {
    if (this.isAsking) {
      this.callbacks.onCancel();
    }
    this.contentEl.empty();
  }
}
