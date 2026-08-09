export interface SelectionActionCardAnchor {
  bottom: number;
  height: number;
  left: number;
  right: number;
  top: number;
  width: number;
}

export interface SelectionActionCardProcessingOptions {
  anchor: SelectionActionCardAnchor;
  message?: string;
  cancelLabel?: string;
  onCancel?: () => void;
}

export interface SelectionActionCardAnswerOptions {
  anchor: SelectionActionCardAnchor;
  answer: string;
  copyLabel?: string;
  dismissLabel?: string;
  onCopy?: () => void;
  onDismiss?: () => void;
}

export interface SelectionActionCardErrorOptions {
  anchor: SelectionActionCardAnchor;
  message: string;
  onDismiss?: () => void;
  onRetry: () => void;
}

/**
 * A provider-neutral, viewport-anchored card for actions and their result.
 * Consumers own selection tracking and async work; this class only renders state.
 */
export class SelectionActionCard {
  private cardEl: HTMLElement | null = null;
  private destroyed = false;

  constructor(private readonly ownerDocument: Document = document) {}

  getElement(): HTMLElement | null {
    return this.cardEl;
  }

  isVisible(): boolean {
    return this.cardEl?.style.display !== 'none';
  }

  showProcessing(options: SelectionActionCardProcessingOptions): void {
    const cardEl = this.prepareCard(options.anchor, 'processing');
    if (!cardEl) return;

    const statusEl = this.createElement('div', 'claudian-selection-action-card__processing-status');
    statusEl.appendChild(this.createElement('span', 'claudian-selection-action-card__processing-icon', '✨'));
    statusEl.appendChild(this.createElement(
      'span',
      'claudian-selection-action-card__processing-text',
      options.message ?? 'Focusing...',
    ));
    cardEl.appendChild(statusEl);
    cardEl.setAttribute('aria-live', 'polite');
    if (options.onCancel) {
      this.addActionButton(cardEl, 'cancel', options.cancelLabel ?? '⏹', options.onCancel, 'Dừng');
    }
  }

  showAnswer(options: SelectionActionCardAnswerOptions): void {
    const cardEl = this.prepareCard(options.anchor, 'answer');
    if (!cardEl) return;

    cardEl.appendChild(this.createElement('div', 'claudian-selection-action-card__content', options.answer));
    const actionsEl = this.createElement('div', 'claudian-selection-action-card__footer');
    cardEl.appendChild(actionsEl);
    if (options.onCopy) {
      this.addActionButton(actionsEl, 'copy', options.copyLabel ?? 'Copy', options.onCopy);
    }
    this.addDismissButton(actionsEl, options.dismissLabel ?? 'Close', options.onDismiss);
  }

  showError(options: SelectionActionCardErrorOptions): void {
    const cardEl = this.prepareCard(options.anchor, 'answer');
    if (!cardEl) return;
    cardEl.appendChild(this.createElement('div', 'claudian-selection-action-card__content', options.message));
    const actionsEl = this.createElement('div', 'claudian-selection-action-card__footer');
    cardEl.appendChild(actionsEl);
    this.addActionButton(actionsEl, 'retry', 'Thử lại', options.onRetry);
    this.addDismissButton(actionsEl, 'Đóng', options.onDismiss);
  }

  hide(): void {
    if (this.cardEl) {
      this.cardEl.style.display = 'none';
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.cardEl?.remove();
    this.cardEl = null;
  }

  private prepareCard(anchor: SelectionActionCardAnchor, state: string): HTMLElement | null {
    if (this.destroyed) return null;

    const cardEl = this.ensureCard();
    cardEl.replaceChildren();
    cardEl.className = `claudian-selection-action-card claudian-selection-action-card--${state}`;
    cardEl.setAttribute('role', 'status');
    cardEl.style.display = 'flex';
    this.position(cardEl, anchor);
    return cardEl;
  }

  private ensureCard(): HTMLElement {
    if (!this.cardEl) {
      this.cardEl = this.createElement('div', 'claudian-selection-action-card');
      this.ownerDocument.body.appendChild(this.cardEl);
      this.cardEl.addEventListener('pointerdown', (event) => {
        event.preventDefault();
      });
    }
    return this.cardEl;
  }

  private position(cardEl: HTMLElement, anchor: SelectionActionCardAnchor): void {
    const viewport = this.ownerDocument.defaultView;
    const viewportWidth = viewport?.innerWidth ?? 0;
    const viewportHeight = viewport?.innerHeight ?? 0;
    const margin = 8;
    const gap = 8;
    const cardWidth = cardEl.offsetWidth || 180;
    const cardHeight = cardEl.offsetHeight || 34;

    const alignsToSelectionStart = cardEl.classList.contains('claudian-selection-action-card--processing');
    let left = alignsToSelectionStart
      ? anchor.left
      : anchor.left + (anchor.width - cardWidth) / 2;
    let top = anchor.bottom + gap;

    if (viewportWidth > 0) {
      left = Math.max(margin, Math.min(left, viewportWidth - cardWidth - margin));
    }
    if (viewportHeight > 0 && top + cardHeight > viewportHeight - margin) {
      top = Math.max(margin, anchor.top - cardHeight - gap);
    }

    cardEl.style.left = `${Math.round(left)}px`;
    cardEl.style.top = `${Math.round(top)}px`;
  }

  private addDismissButton(containerEl: HTMLElement, label: string, onDismiss?: () => void): void {
    this.addActionButton(containerEl, 'dismiss', label, () => {
      this.hide();
      onDismiss?.();
    });
  }

  private addActionButton(
    containerEl: HTMLElement,
    id: string,
    label: string,
    onSelect: () => void,
    ariaLabel?: string,
  ): void {
    const dismissButton = this.createElement('button', 'claudian-selection-action-card__action', label, {
      type: 'button',
      'data-selection-action': id,
    });
    if (ariaLabel) dismissButton.setAttribute('aria-label', ariaLabel);
    containerEl.appendChild(dismissButton);
    dismissButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      onSelect();
    });
  }

  private createElement(
    tagName: string,
    className: string,
    text?: string,
    attributes: Record<string, string> = {},
  ): HTMLElement {
    const element = this.ownerDocument.body.createEl(tagName as keyof HTMLElementTagNameMap);
    element.remove();
    element.className = className;
    if (text !== undefined) element.textContent = text;
    for (const [name, value] of Object.entries(attributes)) {
      element.setAttribute(name, value);
    }
    return element;
  }
}
