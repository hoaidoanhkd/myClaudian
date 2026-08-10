import type {
  VaultAskResult,
  VaultAskService as VaultAskServiceContract,
} from '../providers/types';
import type { AuxiliaryExecutionContext } from './AuxiliaryExecutionContext';
import { AuxiliarySessionController } from './AuxiliarySessionController';

export interface VaultAskServiceOptions extends AuxiliaryExecutionContext {
  readonly resolveModel?: () => string | undefined;
}

export class VaultAskService implements VaultAskServiceContract {
  private readonly controller: AuxiliarySessionController;

  constructor(private readonly options: VaultAskServiceOptions) {
    this.controller = new AuxiliarySessionController(
      options,
      'vault-ask',
      { kind: 'allow-list', names: ['Grep', 'Read'] },
    );
  }

  async askVault(
    question: string,
    onProgress?: (accumulatedText: string) => void,
  ): Promise<VaultAskResult> {
    try {
      await this.controller.startRoot();
      const answer = await this.controller.execute({
        model: this.options.resolveModel?.(),
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

Answer the user's question using only the content of files in the current vault.

Search efficiently:
- Use Grep first to identify the smallest set of relevant notes, then Read only those notes or relevant sections.
- Aim to answer within 2-3 tool calls when possible. Avoid broad or repeated searches and do not read the entire vault.
- Stop searching once you have enough evidence to answer confidently.

**IMPORTANT:** Be concise. Cite the vault-relative path of every note you used, in parentheses at the end of the relevant sentence. If nothing in the vault answers the question, say so directly instead of guessing.`;
