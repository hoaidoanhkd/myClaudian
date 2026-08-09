import { setIcon } from 'obsidian';

import { SelectionActionCard } from '../../../shared/components/SelectionActionCard';

export interface EditorNoteSelectionPopoverOptions {
  onExplain: (selectedText: string) => void;
  onRefine: (selectedText: string) => void;
  onDismiss: () => void;
}

export class EditorNoteSelectionPopover {
  private popoverEl: HTMLElement | null = null;
  private readonly explanationCard = new SelectionActionCard();
  private currentText = '';
  private lastRect: DOMRect | null = null;

  constructor(private readonly options: EditorNoteSelectionPopoverOptions) {}

  show(selectedText: string, rect: DOMRect): void {
    this.currentText = selectedText;
    this.lastRect = rect;
    if (this.popoverEl && !this.popoverEl.querySelector('.claudian-note-popover-btn')) {
      this.popoverEl.remove();
      this.popoverEl = null;
    }
    if (!this.popoverEl) {
      this.createPopover();
    }

    if (!this.popoverEl) return;

    this.popoverEl.style.display = 'flex';

    this.position(rect);
  }

  showLoading(): void {
    if (!this.lastRect) return;
    this.hideActionPopover();
    this.explanationCard.showProcessing({
      anchor: this.lastRect,
      message: 'Focusing...',
      onCancel: () => this.options.onDismiss(),
    });
  }

  showExplanation(explanation: string): void {
    if (!this.lastRect) return;
    this.hideActionPopover();
    this.explanationCard.showAnswer({
      anchor: this.lastRect,
      answer: explanation,
      copyLabel: 'Sao chép',
      dismissLabel: 'Đóng',
      onCopy: () => void navigator.clipboard?.writeText(explanation),
      onDismiss: () => this.options.onDismiss(),
    });
  }

  showExplanationAt(explanation: string, rect: DOMRect): void {
    this.lastRect = rect;
    if (!this.popoverEl) {
      this.createPopover();
    }
    this.showExplanation(explanation);
  }

  private position(rect: DOMRect, belowSelection = false): void {
    if (!this.popoverEl) return;

    // Calculate position relative to viewport
    const popoverWidth = this.popoverEl.offsetWidth || 180;
    const popoverHeight = this.popoverEl.offsetHeight || 34;

    let left = rect.left + rect.width / 2 - popoverWidth / 2;
    let top = belowSelection ? rect.bottom + 8 : rect.top - popoverHeight - 8;

    // Keep within window bounds
    if (left < 10) left = 10;
    if (left + popoverWidth > window.innerWidth - 10) {
      left = window.innerWidth - popoverWidth - 10;
    }

    if (!belowSelection && top < 10) {
      top = rect.bottom + 8; // flip below if near top
    }
    if (top + popoverHeight > window.innerHeight - 10) {
      top = Math.max(10, rect.top - popoverHeight - 8);
    }

    this.popoverEl.style.left = `${left}px`;
    this.popoverEl.style.top = `${top}px`;
  }

  hide(): void {
    this.hideActionPopover();
    this.explanationCard.hide();
    this.currentText = '';
    this.lastRect = null;
  }

  destroy(): void {
    this.explanationCard.destroy();
    if (this.popoverEl) {
      this.popoverEl.remove();
      this.popoverEl = null;
    }
  }

  private hideActionPopover(): void {
    if (this.popoverEl) this.popoverEl.style.display = 'none';
  }

  private createPopover(): void {
    this.popoverEl = document.body.createDiv({
      cls: 'claudian-editor-note-popover',
    });
    const preserveEditorSelection = (event: Event): void => {
      event.preventDefault();
      event.stopPropagation();
    };

    // Explain button
    const explainBtn = this.popoverEl.createEl('button', {
      cls: 'claudian-note-popover-btn',
      attr: { type: 'button', 'aria-label': 'Giải thích' },
    });
    setIcon(explainBtn, 'help-circle');
    explainBtn.createSpan({ text: 'Giải thích' });
    explainBtn.addEventListener('pointerdown', preserveEditorSelection);
    explainBtn.addEventListener('mousedown', preserveEditorSelection);
    explainBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const text = this.currentText;
      if (text) {
        this.options.onExplain(text);
      }
    });

    // Refine button
    const refineBtn = this.popoverEl.createEl('button', {
      cls: 'claudian-note-popover-btn',
      attr: { type: 'button', 'aria-label': 'Viết lại' },
    });
    setIcon(refineBtn, 'sparkles');
    refineBtn.createSpan({ text: 'Viết lại' });
    refineBtn.addEventListener('pointerdown', preserveEditorSelection);
    refineBtn.addEventListener('mousedown', preserveEditorSelection);
    refineBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const text = this.currentText;
      this.hide();
      this.options.onDismiss();
      if (text) {
        this.options.onRefine(text);
      }
    });

    // Close button
    const closeBtn = this.popoverEl.createEl('button', {
      cls: 'claudian-note-popover-close',
      text: '×',
      attr: { type: 'button', 'aria-label': 'Đóng' },
    });
    closeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.hide();
      this.options.onDismiss();
    });
  }
}
