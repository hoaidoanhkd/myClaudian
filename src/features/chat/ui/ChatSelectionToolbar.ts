import { setIcon } from 'obsidian';

import { SelectionActionCard } from '../../../shared/components/SelectionActionCard';

export interface ChatSelectionToolbarOptions {
  onExplain: (selectedText: string) => Promise<string>;
  onRefine: (selectedText: string) => void;
}

export class ChatSelectionToolbar {
  private toolbarEl: HTMLElement | null = null;
  private currentSelectionText = '';
  private currentSelectionRect: DOMRect | null = null;
  private readonly explanationCard: SelectionActionCard;
  private explanationGeneration = 0;
  private isDestroyed = false;

  private readonly handleSelectionChange = () => {
    if (this.isDestroyed) return;
    this.updateToolbarPosition();
  };

  private readonly handleMouseDown = (e: MouseEvent) => {
    if (this.toolbarEl && !this.toolbarEl.contains(e.target as Node)) {
      this.hide();
    }
  };

  constructor(
    private readonly containerEl: HTMLElement,
    private readonly options: ChatSelectionToolbarOptions,
  ) {
    this.explanationCard = new SelectionActionCard(this.containerEl.ownerDocument);
    const ownerDoc = this.containerEl.ownerDocument || document;
    ownerDoc.addEventListener('selectionchange', this.handleSelectionChange);
    ownerDoc.addEventListener('mousedown', this.handleMouseDown);
  }

  destroy(): void {
    this.isDestroyed = true;
    const ownerDoc = this.containerEl.ownerDocument || document;
    ownerDoc.removeEventListener('selectionchange', this.handleSelectionChange);
    ownerDoc.removeEventListener('mousedown', this.handleMouseDown);
    this.explanationGeneration += 1;
    this.explanationCard.destroy();
    this.removeToolbar();
  }

  private updateToolbarPosition(): void {
    const ownerDoc = this.containerEl.ownerDocument || document;
    const selection = ownerDoc.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) {
      this.hide();
      return;
    }

    const text = selection.toString().trim();
    if (!text) {
      this.hide();
      return;
    }

    const range = selection.getRangeAt(0);
    const commonAncestor = range.commonAncestorContainer;
    const commonEl = commonAncestor.nodeType === Node.ELEMENT_NODE
      ? (commonAncestor as HTMLElement)
      : commonAncestor.parentElement;

    if (!commonEl || !this.containerEl.contains(commonEl)) {
      this.hide();
      return;
    }

    if (commonEl.closest('textarea, input, .cm-editor')) {
      this.hide();
      return;
    }

    this.currentSelectionText = text;
    const rect = range.getBoundingClientRect();
    this.currentSelectionRect = rect;
    const containerRect = this.containerEl.getBoundingClientRect();

    if (!this.toolbarEl) {
      this.createToolbar();
    }

    if (this.toolbarEl) {
      this.toolbarEl.style.display = 'flex';
      const top = Math.max(8, rect.top - containerRect.top - 44);
      const left = Math.min(
        containerRect.width - 200,
        Math.max(8, rect.left - containerRect.left + (rect.width / 2) - 90),
      );
      this.toolbarEl.style.top = `${top}px`;
      this.toolbarEl.style.left = `${left}px`;
    }
  }

  private createToolbar(): void {
    this.toolbarEl = this.containerEl.createDiv({ cls: 'claudian-chat-selection-toolbar' });

    // Explain button
    const explainBtn = this.toolbarEl.createEl('button', {
      cls: 'claudian-selection-action-btn',
      attr: { 'aria-label': 'Giải thích đoạn này', title: 'Giải thích đoạn này' },
    });
    setIcon(explainBtn, 'help-circle');
    explainBtn.createSpan({ text: 'Giải thích' });
    explainBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (this.currentSelectionText) {
        const text = this.currentSelectionText;
        const rect = this.currentSelectionRect;
        this.hide();
        if (!rect) return;
        const generation = ++this.explanationGeneration;
        this.explanationCard.showProcessing({
          anchor: rect,
          message: 'Focusing...',
          onCancel: () => {
            this.explanationGeneration += 1;
            this.explanationCard.hide();
          },
        });
        void this.options.onExplain(text).then((explanation) => {
          if (this.isDestroyed || generation !== this.explanationGeneration) return;
          this.explanationCard.showAnswer({
            anchor: rect,
            answer: explanation,
            copyLabel: 'Sao chép',
            dismissLabel: 'Đóng',
            onCopy: () => void navigator.clipboard?.writeText(explanation),
          });
        });
      }
    });

    // Refine button
    const refineBtn = this.toolbarEl.createEl('button', {
      cls: 'claudian-selection-action-btn',
      attr: { 'aria-label': 'Viết lại / Cải thiện', title: 'Viết lại / Cải thiện' },
    });
    setIcon(refineBtn, 'sparkles');
    refineBtn.createSpan({ text: 'Viết lại' });
    refineBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (this.currentSelectionText) {
        this.options.onRefine(this.currentSelectionText);
        this.hide();
      }
    });

    // Copy button
    const copyBtn = this.toolbarEl.createEl('button', {
      cls: 'claudian-selection-action-btn',
      attr: { 'aria-label': 'Sao chép', title: 'Sao chép' },
    });
    setIcon(copyBtn, 'copy');
    copyBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (this.currentSelectionText) {
        void navigator.clipboard.writeText(this.currentSelectionText);
        this.hide();
      }
    });
  }

  private hide(): void {
    if (this.toolbarEl) {
      this.toolbarEl.style.display = 'none';
    }
  }

  private removeToolbar(): void {
    if (this.toolbarEl) {
      this.toolbarEl.remove();
      this.toolbarEl = null;
    }
  }
}
