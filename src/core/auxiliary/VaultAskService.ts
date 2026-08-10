import type {
  VaultAskResult,
  VaultAskService as VaultAskServiceContract,
} from '../providers/types';
import type { AuxiliaryExecutionContext } from './AuxiliaryExecutionContext';
import { AuxiliarySessionController } from './AuxiliarySessionController';

export class VaultAskService implements VaultAskServiceContract {
  private readonly controller: AuxiliarySessionController;

  constructor(context: AuxiliaryExecutionContext) {
    this.controller = new AuxiliarySessionController(
      context,
      'vault-ask',
      { kind: 'read-only' },
    );
  }

  async askVault(
    question: string,
    onProgress?: (accumulatedText: string) => void,
  ): Promise<VaultAskResult> {
    try {
      await this.controller.startRoot();
      const answer = await this.controller.execute({
        prompt: question,
        systemPrompt: VAULT_ASK_SYSTEM_PROMPT,
        onProgress,
      });
      return answer.trim()
        ? { answer: answer.trim(), success: true }
        : { error: 'No answer was returned.', success: false };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'Unable to answer the question.',
        success: false,
      };
    } finally {
      await this.controller.dispose();
    }
  }

  cancel(): void {
    this.controller.cancel();
  }
}

const VAULT_ASK_SYSTEM_PROMPT = `# Ask Across Vault

Answer the user's question using only the content of files in the current vault. Use search and read tools to find relevant notes before answering.

**IMPORTANT:** Be concise. Cite the vault-relative path of every note you used, in parentheses at the end of the relevant sentence. If nothing in the vault answers the question, say so directly instead of guessing.`;
