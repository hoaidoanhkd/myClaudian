import type { SelectionExplanationService as SelectionExplanationServiceContract } from '../providers/types';
import type { AuxiliaryExecutionContext } from './AuxiliaryExecutionContext';
import { AuxiliarySessionController } from './AuxiliarySessionController';

export class SelectionExplanationService implements SelectionExplanationServiceContract {
  private readonly controller: AuxiliarySessionController;

  constructor(context: AuxiliaryExecutionContext) {
    this.controller = new AuxiliarySessionController(
      context,
      'selection-explanation',
      { kind: 'read-only' },
    );
  }

  async explainSelection(
    selectedText: string,
    onProgress?: (accumulatedText: string) => void,
  ): Promise<{ success: boolean; explanation?: string; error?: string }> {
    try {
      await this.controller.startRoot();
      const explanation = await this.controller.execute({
        prompt: buildSelectionExplanationPrompt(selectedText),
        systemPrompt: 'You are a concise explanation assistant. Follow the user request exactly.',
        onProgress,
      });
      return explanation.trim()
        ? { success: true, explanation: explanation.trim() }
        : { success: false, error: 'No explanation was returned.' };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unable to explain the selection.' };
    } finally {
      await this.controller.dispose();
    }
  }

  cancel(): void {
    this.controller.cancel();
  }
}

function buildSelectionExplanationPrompt(selectedText: string): string {
  return `# Explain Selected Text

Explain the content inside the selection tags clearly in Vietnamese.

**IMPORTANT:** Analyze only the selected content. Do not edit, rewrite, or repeat it. Do not ask follow-up questions; explain unfamiliar terms or context directly when needed.

<selection>
${selectedText}
</selection>`;
}
