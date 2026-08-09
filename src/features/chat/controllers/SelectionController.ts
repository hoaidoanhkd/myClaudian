import type { App } from 'obsidian';
import { MarkdownView, Notice } from 'obsidian';

import { ProviderRegistry } from '../../../core/providers/ProviderRegistry';
import { ProviderWorkspaceRegistry } from '../../../core/providers/ProviderWorkspaceRegistry';
import type { SelectionExplanationService } from '../../../core/providers/types';
import { hideSelectionHighlight, showSelectionHighlight } from '../../../shared/components/SelectionHighlight';
import { type EditorSelectionContext, getEditorView } from '../../../utils/editor';
import type { FeatureHost } from '../../FeatureHost';
import {
  type InlineEditContext,
  type InlineEditHost,
  InlineEditModal,
} from '../../inline-edit/ui/InlineEditModal';
import type { StoredSelection } from '../state/types';
import type { ComposerContextTray } from '../ui/ComposerContextTray';
import { EditorNoteSelectionPopover } from '../ui/EditorNoteSelectionPopover';
import { EditorSelectionExplanationPreview } from '../ui/EditorSelectionExplanationPreview';

const SELECTION_POLL_INTERVAL = 250;
const INPUT_HANDOFF_GRACE_MS = 1500;
const HIGHLIGHT_KEY = 'claudian-selection';

type CustomHighlightRegistry = {
  delete: (name: string) => boolean;
  set: (name: string, highlight: unknown) => void;
};
type CustomHighlightConstructor = new (...ranges: Range[]) => unknown;
type FocusScopeInput = HTMLElement | HTMLElement[];
type SelectionContextTray = Pick<ComposerContextTray, 'setItems' | 'clearItems'>;

export class SelectionController {
  private app: App;
  private contextTray: SelectionContextTray;
  private inputEl: HTMLElement;
  private focusScopeEls: HTMLElement[];
  private onVisibilityChange: (() => void) | null;
  private onUserSelectionChanged: (() => void) | null;
  private onSubmitPrompt: ((prompt: string) => void) | null;
  private storedSelection: StoredSelection | null = null;
  private inputHandoffGraceUntil: number | null = null;
  private pollInterval: number | null = null;
  private notePopover: EditorNoteSelectionPopover | null = null;
  private readonly explanationPreview = new EditorSelectionExplanationPreview();
  private isInlineEditActive = false;
  private isExplaining = false;
  private isShowingExplanation = false;
  private explanationGeneration = 0;
  private explanationService: SelectionExplanationService | null = null;
  private readonly selectionChangeHandler = () => this.poll();
  private readonly explanationEscapeHandler = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || (!this.isExplaining && !this.isShowingExplanation)) return;
    event.preventDefault();
    this.clear();
    this.onUserSelectionChanged?.();
  };
  private readonly focusScopePointerDownHandler = () => {
    if (!this.storedSelection) return;
    this.inputHandoffGraceUntil = Date.now() + INPUT_HANDOFF_GRACE_MS;
  };
  private readonly focusScopeFocusInHandler = (event: FocusEvent) => {
    const relatedTarget = event.relatedTarget as Node | null;
    if (relatedTarget && this.isNodeWithinFocusScopes(relatedTarget)) return;
    this.showHighlight();
  };

  constructor(
    app: App,
    contextTray: SelectionContextTray,
    inputEl: HTMLElement,
    onVisibilityChange?: () => void,
    focusScopeEl?: FocusScopeInput,
    onUserSelectionChanged?: () => void,
    onSubmitPrompt?: (prompt: string) => void,
    private pluginHost?: FeatureHost,
    private showNotePopover = false,
  ) {
    this.app = app;
    this.contextTray = contextTray;
    this.inputEl = inputEl;
    this.focusScopeEls = this.normalizeFocusScopes(focusScopeEl);
    this.onVisibilityChange = onVisibilityChange ?? null;
    this.onUserSelectionChanged = onUserSelectionChanged ?? null;
    this.onSubmitPrompt = onSubmitPrompt ?? null;
  }

  start(): void {
    if (this.pollInterval) return;
    this.inputEl.ownerDocument.addEventListener('selectionchange', this.selectionChangeHandler);
    this.inputEl.ownerDocument.addEventListener('keydown', this.explanationEscapeHandler);
    this.inputEl.addEventListener('pointerdown', this.focusScopePointerDownHandler);
    for (const focusScopeEl of this.focusScopeEls) {
      if (focusScopeEl !== this.inputEl) {
        focusScopeEl.addEventListener('pointerdown', this.focusScopePointerDownHandler);
      }
      focusScopeEl.addEventListener('focusin', this.focusScopeFocusInHandler);
    }
    this.pollInterval = window.setInterval(() => this.poll(), SELECTION_POLL_INTERVAL);
  }

  stop(): void {
    if (this.pollInterval) {
      window.clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    this.inputEl.ownerDocument.removeEventListener('selectionchange', this.selectionChangeHandler);
    this.inputEl.ownerDocument.removeEventListener('keydown', this.explanationEscapeHandler);
    this.inputEl.removeEventListener('pointerdown', this.focusScopePointerDownHandler);
    for (const focusScopeEl of this.focusScopeEls) {
      if (focusScopeEl !== this.inputEl) {
        focusScopeEl.removeEventListener('pointerdown', this.focusScopePointerDownHandler);
      }
      focusScopeEl.removeEventListener('focusin', this.focusScopeFocusInHandler);
    }
    this.clear();
    this.cancelExplanation();
    this.notePopover?.destroy();
    this.notePopover = null;
    this.explanationPreview.hide();
  }

  dispose(): void {
    this.stop();
  }

  // ============================================
  // Selection Polling
  // ============================================

  private poll(): void {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) {
      // Keep the captured selection only while focus is transitioning into
      // the chat UI; any other leaf switch should drop stale prompt context.
      this.clearWhenMarkdownContextIsUnavailable();
      return;
    }

    // Reading/preview mode has no usable CM6 selection — use DOM selection instead
    if (view.getMode() === 'preview') {
      this.pollReadingMode(view);
      return;
    }

    const editor = view.editor;
    const editorView = getEditorView(editor);
    if (!editorView) {
      this.clearWhenMarkdownContextIsUnavailable();
      return;
    }

    const selectedText = editor.getSelection();

    if (selectedText.trim()) {
      this.inputHandoffGraceUntil = null;
      const fromPos = editor.getCursor('from');
      const toPos = editor.getCursor('to');
      const from = editor.posToOffset(fromPos);
      const to = editor.posToOffset(toPos);
      const startLine = fromPos.line + 1; // 1-indexed for display

      const notePath = view.file?.path || 'unknown';
      const lineCount = selectedText.split(/\r?\n/).length;

      const s = this.storedSelection;
      const sameRange = s
        && s.editorView === editorView
        && s.from === from
        && s.to === to
        && s.notePath === notePath;
      const unchanged = sameRange
        && s.selectedText === selectedText
        && s.lineCount === lineCount
        && s.startLine === startLine;

      if (!unchanged) {
        this.isShowingExplanation = false;
        if (s && !sameRange) {
          this.clearHighlight();
        }
        this.storedSelection = { notePath, selectedText, lineCount, startLine, from, to, editorView };
        this.updateIndicator();
        this.onUserSelectionChanged?.();
      } else {
        this.refreshNotePopover();
      }
    } else {
      this.handleDeselection();
    }
  }

  private pollReadingMode(view: MarkdownView): void {
    const containerEl = view.containerEl;
    if (!containerEl) {
      this.clearWhenMarkdownContextIsUnavailable();
      return;
    }

    const selection = this.getDocumentSelection(containerEl.ownerDocument);
    const selectedText = selection?.toString() ?? '';

    if (selectedText.trim()) {
      const anchorNode = selection?.anchorNode;
      const focusNode = selection?.focusNode;
      if (
        (!anchorNode || !containerEl.contains(anchorNode))
        && (!focusNode || !containerEl.contains(focusNode))
      ) {
        this.handleDeselection();
        return;
      }

      this.inputHandoffGraceUntil = null;
      const notePath = view.file?.path || 'unknown';
      const lineCount = selectedText.split(/\r?\n/).length;
      const domRanges = this.cloneDOMRanges(selection);

      const unchanged = this.storedSelection
        && this.storedSelection.editorView === undefined
        && this.storedSelection.notePath === notePath
        && this.storedSelection.selectedText === selectedText
        && this.storedSelection.lineCount === lineCount
        && this.rangeListsMatch(this.storedSelection.domRanges, domRanges);

      if (!unchanged) {
        this.isShowingExplanation = false;
        this.clearHighlight();
        this.storedSelection = { notePath, selectedText, lineCount, domRanges };
        this.updateIndicator();
        this.onUserSelectionChanged?.();
      } else {
        this.refreshNotePopover();
      }
    } else {
      this.handleDeselection();
    }
  }

  private get cssHighlights(): CustomHighlightRegistry | null {
    const css = typeof CSS === 'undefined'
      ? null
      : CSS as unknown as { highlights?: CustomHighlightRegistry };
    return css?.highlights ?? null;
  }

  private get highlightConstructor(): CustomHighlightConstructor | null {
    const ownerWindow = this.inputEl.ownerDocument.defaultView as unknown as {
      Highlight?: CustomHighlightConstructor;
    } | null;
    const rendererWindow = typeof window === 'undefined'
      ? null
      : window as unknown as { Highlight?: CustomHighlightConstructor };
    return ownerWindow?.Highlight ?? rendererWindow?.Highlight ?? null;
  }

  private rangesMatch(a: Range, b: Range): boolean {
    return a.startContainer === b.startContainer
      && a.startOffset === b.startOffset
      && a.endContainer === b.endContainer
      && a.endOffset === b.endOffset;
  }

  private rangeListsMatch(left: Range[] | undefined, right: Range[]): boolean {
    return left !== undefined
      && left.length === right.length
      && left.every((range, index) => this.rangesMatch(range, right[index]));
  }

  private selectionMatchesRanges(selection: Selection | null, ranges: Range[]): boolean {
    if (!selection || selection.rangeCount !== ranges.length) return false;
    for (let i = 0; i < ranges.length; i++) {
      if (!this.rangesMatch(selection.getRangeAt(i), ranges[i])) {
        return false;
      }
    }
    return true;
  }

  private cloneDOMRanges(selection: Selection | null): Range[] {
    if (!selection) return [];
    const ranges: Range[] = [];
    for (let i = 0; i < selection.rangeCount; i++) {
      ranges.push(selection.getRangeAt(i).cloneRange());
    }
    return ranges;
  }

  private getDocumentSelection(ownerDocument?: Document | null): Selection | null {
    if (ownerDocument && typeof ownerDocument.getSelection === 'function') {
      return ownerDocument.getSelection();
    }

    const fallbackDocument = this.inputEl.ownerDocument;
    if (fallbackDocument && typeof fallbackDocument.getSelection === 'function') {
      return fallbackDocument.getSelection();
    }

    return null;
  }

  private getActiveElement(ownerDocument?: Document | null): Element | null {
    return ownerDocument?.activeElement ?? this.inputEl.ownerDocument?.activeElement ?? null;
  }

  private normalizeFocusScopes(focusScopeEl?: FocusScopeInput): HTMLElement[] {
    const focusScopes = Array.isArray(focusScopeEl)
      ? focusScopeEl
      : [focusScopeEl ?? this.inputEl];
    return Array.from(new Set(focusScopes.filter(Boolean)));
  }

  private getFocusScopeOwnerDocument(): Document | null {
    return this.focusScopeEls[0]?.ownerDocument ?? this.inputEl.ownerDocument ?? null;
  }

  private isNodeWithinFocusScopes(node: Node): boolean {
    return this.focusScopeEls.some((focusScopeEl) =>
      node === focusScopeEl || focusScopeEl.contains(node)
    );
  }

  private isFocusWithinChatSidebar(): boolean {
    const activeElement = this.getActiveElement(this.getFocusScopeOwnerDocument()) as Node | null;
    return activeElement !== null && this.isNodeWithinFocusScopes(activeElement);
  }

  private isNativeEditorSelectionVisible(sel: StoredSelection): boolean {
    if (!sel.editorView || sel.from === undefined || sel.to === undefined) {
      return false;
    }

    const activeElement = this.getActiveElement(sel.editorView.dom.ownerDocument) as Node | null;
    if (activeElement === null || !sel.editorView.dom.contains(activeElement)) {
      return false;
    }

    const cmSel = sel.editorView.state.selection.main;
    return cmSel.from === sel.from && cmSel.to === sel.to;
  }

  private isNativePreviewSelectionVisible(ranges: Range[]): boolean {
    if (this.isFocusWithinChatSidebar()) {
      return false;
    }

    return this.selectionMatchesRanges(this.getDocumentSelection(this.getFocusScopeOwnerDocument()), ranges);
  }

  private clearWhenMarkdownContextIsUnavailable(): void {
    if (!this.storedSelection) return;
    if (this.isFocusWithinChatSidebar()) {
      this.inputHandoffGraceUntil = null;
      return;
    }
    if (this.inputHandoffGraceUntil !== null && Date.now() <= this.inputHandoffGraceUntil) {
      return;
    }

    this.inputHandoffGraceUntil = null;
    this.clearHighlight();
    this.storedSelection = null;
    this.updateIndicator();
    this.onUserSelectionChanged?.();
  }

  private handleDeselection(): void {
    if (!this.storedSelection) return;
    // An inline action moves focus outside the editor. Preserve the frozen
    // selection while its explanation is running or being reviewed.
    if (this.isExplaining || this.isShowingExplanation) return;
    if (this.isFocusWithinChatSidebar()) {
      this.inputHandoffGraceUntil = null;
      return;
    }

    if (this.inputHandoffGraceUntil !== null && Date.now() <= this.inputHandoffGraceUntil) {
      return;
    }

    this.inputHandoffGraceUntil = null;
    this.clearHighlight();
    this.storedSelection = null;
    this.updateIndicator();
    this.onUserSelectionChanged?.();
  }

  // ============================================
  // Highlight Management
  // ============================================

  showHighlight(): void {
    const sel = this.storedSelection;
    if (!sel) return;

    // Edit mode: prefer native CM6 unfocused selection (.cm-selectionBackground)
    if (sel.editorView && sel.from !== undefined && sel.to !== undefined) {
      if (this.isNativeEditorSelectionVisible(sel)) {
        // Native is showing — clear any stale mock
        hideSelectionHighlight(sel.editorView);
        return;
      }
      // Native selection not visible (e.g., input has focus) — show mock
      showSelectionHighlight(sel.editorView, sel.from, sel.to);
      return;
    }

    // Preview mode: prefer native DOM selection (::selection)
    if (sel.domRanges?.length) {
      if (this.isNativePreviewSelectionVisible(sel.domRanges)) {
        // Native is showing — clear any stale mock
        this.cssHighlights?.delete(HIGHLIGHT_KEY);
        return;
      }
      // Native selection not visible (e.g., input has focus) — show mock
      const validRanges = sel.domRanges.filter(r => r.startContainer.isConnected);
      const HighlightCtor = this.highlightConstructor;
      if (validRanges.length && HighlightCtor) {
        this.cssHighlights?.set(HIGHLIGHT_KEY, new HighlightCtor(...validRanges));
      }
    }
  }

  private clearHighlight(): void {
    if (this.storedSelection?.editorView) {
      hideSelectionHighlight(this.storedSelection.editorView);
    }
    this.cssHighlights?.delete(HIGHLIGHT_KEY);
  }

  // ============================================
  // Indicator
  // ============================================

  private updateIndicator(): void {
    if (this.storedSelection) {
      const lineText = this.storedSelection.lineCount === 1 ? 'line' : 'lines';
      const label = `${this.storedSelection.lineCount} ${lineText} selected`;
      this.contextTray.setItems('editor-selection', [{
        id: 'editor-selection',
        kind: 'selection',
        label,
        icon: 'text-select',
        ariaLabel: label,
        onRemove: () => {
          this.clear();
          this.onUserSelectionChanged?.();
        },
      }]);

      if (this.showNotePopover && !this.isInlineEditActive && !this.isExplaining && !this.notePopover) {
        this.notePopover = new EditorNoteSelectionPopover({
          onExplain: (text) => {
            const textToUse = text || this.storedSelection?.selectedText || '';
            if (!textToUse.trim()) return;
            void this.explainSelection(textToUse);
          },
          onRefine: (text) => {
            const textToUse = text || this.storedSelection?.selectedText || '';
            const from = this.storedSelection?.from;
            const to = this.storedSelection?.to;
            this.clear();
            this.onUserSelectionChanged?.();
            this.triggerInlineEdit(textToUse, `# Improve Writing

Revise the provided content to improve its overall writing quality.

**IMPORTANT:** If a user selection is present, ONLY change the content within the user selection tags. DO NOT change any of the text outside of it. If there is no text selected, review the entire page or relevant context.

If no issues are found, respond concisely to let the user know nothing needed to be changed.

Additional guidelines:

- Do NOT add new information or alter the meaning of the original content.
- Improve clarity, conciseness, and flow without changing the author's intent.
- Reorder or split sentences when it improves readability.
- Reduce repetition and remove filler or redundant phrases.
- Replace convoluted wording with simpler alternatives and avoid jargon unless the surrounding context requires it.
- Correct spelling, grammar, and punctuation.
- Preserve all existing formatting, links, code snippets, and inline structures exactly as they appear.`, from, to);
          },
          onDismiss: () => {
            this.cancelExplanation();
            this.clear();
            this.onUserSelectionChanged?.();
          },
        });
      }

      this.refreshNotePopover();
    } else {
      this.contextTray.clearItems('editor-selection');
      this.notePopover?.hide();
    }
    this.updateContextRowVisibility();
  }

  private refreshNotePopover(): void {
    if (!this.showNotePopover || !this.storedSelection) return;
    if (this.isInlineEditActive) {
      this.notePopover?.hide();
      return;
    }
    if (this.isExplaining || this.isShowingExplanation) return;

    const rect = this.getSelectionDOMRect();
    if (rect && rect.width > 0 && rect.height > 0) {
      this.notePopover?.show(this.storedSelection.selectedText, rect);
    }
  }

  private triggerInlineEdit(
    selectedText: string,
    instruction: string,
    fromOffset?: number,
    toOffset?: number,
  ): void {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view || !view.editor) return;

    const editor = view.editor;
    const textToUse = selectedText || editor.getSelection();
    if (!textToUse.trim()) return;

    if (fromOffset !== undefined && toOffset !== undefined) {
      try {
        const fromPos = editor.offsetToPos(fromOffset);
        const toPos = editor.offsetToPos(toOffset);
        editor.setSelection(fromPos, toPos);
      } catch {
        // Fallback to current selection if offsets cannot be converted
      }
    }

    const notePath = view.file?.path || 'unknown';
    const editContext: InlineEditContext = { mode: 'selection', selectedText: textToUse };

    if (!this.pluginHost) {
      new Notice('Inline edit unavailable: plugin instance not found. Try reloading Claudian.');
      return;
    }

    const modal = new InlineEditModal(
      this.app,
      this.pluginHost as InlineEditHost,
      editor,
      view,
      editContext,
      notePath,
      () => [],
      instruction,
    );

    this.isInlineEditActive = true;
    this.notePopover?.hide();
    void modal.openAndWait()
      .then((result) => {
        if (result.decision === 'accept' && result.editedText !== undefined) {
          new Notice('Edit applied');
        }
      })
      .finally(() => {
        this.isInlineEditActive = false;
        this.clear();
      });
  }

  private async explainSelection(selectedText: string): Promise<void> {
    if (!this.pluginHost) {
      new Notice('Explanation unavailable: plugin instance not found. Try reloading Claudian.');
      return;
    }

    this.cancelExplanation();
    const generation = ++this.explanationGeneration;
    this.isExplaining = true;
    this.showExplanationLoading();
    const providerId = ProviderRegistry.resolveSettingsProviderId(this.pluginHost.settings);
    try {
      await ProviderWorkspaceRegistry.ensureInitialized(
        this.pluginHost.providerHost,
        providerId,
        'inline-edit',
      );
      if (generation !== this.explanationGeneration) return;

      const service = ProviderRegistry.createSelectionExplanationService(
        this.pluginHost.providerHost,
        providerId,
      );
      this.explanationService = service;
      const result = await service.explainSelection(selectedText, partialExplanation => {
        if (generation !== this.explanationGeneration) return;
        this.showStreamingExplanation(partialExplanation);
      });
      if (generation !== this.explanationGeneration) return;
      this.isExplaining = false;
      this.isShowingExplanation = true;
      this.explanationService = null;
      if (result.success && result.explanation) {
        this.showExplanationResult(result.explanation);
      } else {
        this.showExplanationError(result.error ?? 'Unable to explain the selection.', selectedText);
      }
    } catch (error) {
      if (generation !== this.explanationGeneration) return;
      this.isExplaining = false;
      this.isShowingExplanation = true;
      this.explanationService = null;
      this.showExplanationError(
        error instanceof Error ? error.message : 'Unable to explain the selection.',
        selectedText,
      );
    }
  }

  private cancelExplanation(): void {
    this.explanationGeneration += 1;
    this.isExplaining = false;
    this.isShowingExplanation = false;
    this.explanationService?.cancel();
    this.explanationService = null;
    this.explanationPreview.hide();
  }

  private showExplanationResult(explanation: string): void {
    const selection = this.storedSelection;
    if (selection?.editorView && selection.to !== undefined) {
      this.notePopover?.hide();
      this.explanationPreview.show(selection.editorView, selection.to, explanation, {
        onDismiss: () => {
          this.clear();
          this.onUserSelectionChanged?.();
        },
      });
      return;
    }
    this.notePopover?.showExplanation(explanation);
  }

  private showExplanationLoading(): void {
    const selection = this.storedSelection;
    if (selection?.editorView && selection.to !== undefined) {
      this.notePopover?.hide();
      this.explanationPreview.showLoading(selection.editorView, selection.to, {
        onDismiss: () => {
          this.clear();
          this.onUserSelectionChanged?.();
        },
      });
      return;
    }
    this.notePopover?.showLoading();
  }

  private showExplanationError(error: string, selectedText: string): void {
    const selection = this.storedSelection;
    if (selection?.editorView && selection.to !== undefined) {
      this.notePopover?.hide();
      this.explanationPreview.showError(selection.editorView, selection.to, error, {
        onDismiss: () => {
          this.clear();
          this.onUserSelectionChanged?.();
        },
        onRetry: () => void this.explainSelection(selectedText),
      });
      return;
    }
    this.notePopover?.showExplanationError(error, () => void this.explainSelection(selectedText));
  }

  private showStreamingExplanation(explanation: string): void {
    const selection = this.storedSelection;
    if (selection?.editorView && selection.to !== undefined) {
      this.notePopover?.hide();
      this.explanationPreview.showStreaming(selection.editorView, selection.to, explanation, {
        onDismiss: () => {
          this.clear();
          this.onUserSelectionChanged?.();
        },
      });
    }
  }

  private getSelectionDOMRect(): DOMRect | null {
    if (!this.storedSelection) return null;
    const { editorView, from, to } = this.storedSelection;

    if (
      editorView
      && typeof editorView.coordsAtPos === 'function'
      && from !== undefined
      && to !== undefined
    ) {
      const startCoords = editorView.coordsAtPos(from);
      const endCoords = editorView.coordsAtPos(to);
      if (startCoords && endCoords) {
        const top = Math.min(startCoords.top, endCoords.top);
        const bottom = Math.max(startCoords.bottom, endCoords.bottom);
        const left = Math.min(startCoords.left, endCoords.left);
        const right = Math.max(startCoords.right, endCoords.right);
        return new DOMRect(left, top, right - left, bottom - top);
      }
    }

    const previewRange = this.storedSelection.domRanges?.[0];
    if (previewRange && typeof previewRange.getBoundingClientRect === 'function') {
      return previewRange.getBoundingClientRect();
    }

    try {
      const domSel = this.getDocumentSelection(this.getFocusScopeOwnerDocument());
      if (domSel && domSel.rangeCount > 0 && !domSel.isCollapsed) {
        const range = domSel.getRangeAt(0);
        if (range && typeof range.getBoundingClientRect === 'function') {
          return range.getBoundingClientRect();
        }
      }
    } catch {
      // Ignore DOM selection errors in mock test environments
    }

    return null;
  }

  updateContextRowVisibility(): void {
    this.onVisibilityChange?.();
  }

  // ============================================
  // Context Access
  // ============================================

  getContext(): EditorSelectionContext | null {
    if (!this.storedSelection) return null;
    return {
      notePath: this.storedSelection.notePath,
      mode: 'selection',
      selectedText: this.storedSelection.selectedText,
      lineCount: this.storedSelection.lineCount,
      ...(this.storedSelection.startLine !== undefined && { startLine: this.storedSelection.startLine }),
    };
  }

  hasSelection(): boolean {
    return this.storedSelection !== null;
  }

  // ============================================
  // Clear
  // ============================================

  clear(): void {
    this.inputHandoffGraceUntil = null;
    this.cancelExplanation();
    this.clearHighlight();
    this.storedSelection = null;
    this.notePopover?.hide();
    this.explanationPreview.hide();
    this.updateIndicator();
  }
}
