import { StateEffect, StateField } from '@codemirror/state';
import { Decoration, EditorView, WidgetType } from '@codemirror/view';

export interface EditorSelectionExplanationPreviewOptions {
  onDismiss: () => void;
  onRetry?: () => void;
}

const showExplanationPreview = StateEffect.define<ExplanationPreviewWidget>();
const hideExplanationPreview = StateEffect.define<null>();

const explanationPreviewField = StateField.define({
  create: () => Decoration.none,
  update: (decorations, transaction) => {
    let next = decorations.map(transaction.changes);
    for (const effect of transaction.effects) {
      if (effect.is(showExplanationPreview)) {
        next = Decoration.set([
          Decoration.widget({
            block: true,
            side: 1,
            widget: effect.value,
          }).range(effect.value.position),
        ]);
      } else if (effect.is(hideExplanationPreview)) {
        next = Decoration.none;
      }
    }
    return next;
  },
  provide: field => EditorView.decorations.from(field),
});

const installedEditors = new WeakSet<EditorView>();

class ExplanationPreviewWidget extends WidgetType {
  constructor(
    readonly position: number,
    private readonly explanation: string | null,
    private readonly isStreaming: boolean,
    private readonly isError: boolean,
    private readonly ownerDocument: Document,
    private readonly options: EditorSelectionExplanationPreviewOptions,
  ) {
    super();
  }

  eq(other: ExplanationPreviewWidget): boolean {
    return this.position === other.position
      && this.explanation === other.explanation
      && this.isStreaming === other.isStreaming
      && this.isError === other.isError;
  }

  toDOM(): HTMLElement {
    if (this.explanation === null) {
      return this.createLoadingDOM();
    }
    const explanation = this.explanation;
    const previewEl = this.ownerDocument.body.createDiv({
      cls: 'claudian-inline-diff-preview claudian-inline-diff-preview--explanation',
    });
    previewEl.remove();
    previewEl.createDiv({
      cls: 'claudian-inline-diff-preview-body',
      text: explanation,
    });
    if (this.isStreaming) return previewEl;
    const actionsEl = previewEl.createDiv({ cls: 'claudian-inline-preview-actions' });
    if (this.isError && this.options.onRetry) {
      const retryButton = actionsEl.createEl('button', {
        cls: 'claudian-inline-preview-action',
        text: 'Thử lại',
        attr: { type: 'button' },
      });
      retryButton.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        this.options.onRetry?.();
      });
    } else {
      const copyButton = actionsEl.createEl('button', {
        cls: 'claudian-inline-preview-action',
        text: 'Sao chép',
        attr: { type: 'button' },
      });
      copyButton.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        void navigator.clipboard?.writeText(explanation);
      });
    }
    const closeButton = actionsEl.createEl('button', {
      cls: 'claudian-inline-preview-action reject',
      text: 'Đóng',
      attr: { type: 'button' },
    });
    closeButton.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      this.options.onDismiss();
    });
    return previewEl;
  }

  private createLoadingDOM(): HTMLElement {
    const loadingEl = this.ownerDocument.body.createDiv({ cls: 'claudian-inline-loading-bar' });
    loadingEl.remove();
    const loadingLeft = loadingEl.createDiv({ cls: 'claudian-inline-loading-left' });
    loadingLeft.createSpan({ cls: 'claudian-inline-loading-icon', text: '✨' });
    loadingLeft.createSpan({ cls: 'claudian-inline-loading-text', text: 'Focusing...' });
    const stopButton = loadingEl.createEl('button', {
      cls: 'claudian-inline-stop-btn',
      text: '⏹',
      attr: { type: 'button', 'aria-label': 'Dừng giải thích' },
    });
    stopButton.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      this.options.onDismiss();
    });
    return loadingEl;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

export class EditorSelectionExplanationPreview {
  private editorView: EditorView | null = null;

  show(
    editorView: EditorView,
    position: number,
    explanation: string,
    options: EditorSelectionExplanationPreviewOptions,
  ): void {
    this.render(editorView, position, explanation, false, false, options);
  }

  showLoading(
    editorView: EditorView,
    position: number,
    options: EditorSelectionExplanationPreviewOptions,
  ): void {
    this.render(editorView, position, null, false, false, options);
  }

  showStreaming(
    editorView: EditorView,
    position: number,
    explanation: string,
    options: EditorSelectionExplanationPreviewOptions,
  ): void {
    this.render(editorView, position, explanation, true, false, options);
  }

  showError(
    editorView: EditorView,
    position: number,
    error: string,
    options: EditorSelectionExplanationPreviewOptions,
  ): void {
    this.render(editorView, position, error, false, true, options);
  }

  private render(
    editorView: EditorView,
    position: number,
    explanation: string | null,
    isStreaming: boolean,
    isError: boolean,
    options: EditorSelectionExplanationPreviewOptions,
  ): void {
    if (!installedEditors.has(editorView)) {
      editorView.dispatch({ effects: StateEffect.appendConfig.of(explanationPreviewField) });
      installedEditors.add(editorView);
    }
    this.editorView = editorView;
    editorView.dispatch({
      effects: showExplanationPreview.of(new ExplanationPreviewWidget(
        position,
        explanation,
        isStreaming,
        isError,
        editorView.dom.ownerDocument,
        options,
      )),
    });
  }

  hide(): void {
    this.editorView?.dispatch({ effects: hideExplanationPreview.of(null) });
    this.editorView = null;
  }
}
