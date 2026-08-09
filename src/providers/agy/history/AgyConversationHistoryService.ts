import type {
  ProviderConversationHistoryService,
} from '../../../core/providers/types';
import type { Conversation } from '../../../core/types';

export class AgyConversationHistoryService implements ProviderConversationHistoryService {
  async hydrateConversationHistory(
    _conversation: Conversation,
    _vaultPath: string | null,
  ): Promise<void> {
    return;
  }

  resolveSessionIdForConversation(conversation: Conversation | null): string | null {
    return conversation?.sessionId ?? null;
  }

  async resolveMissingConversationSession(
    conversation: Conversation,
    _vaultPath: string | null,
    missingProviderSessionId?: string,
  ): Promise<'delete' | 'reset' | 'preserve'> {
    if (
      !conversation.sessionId
      || !missingProviderSessionId
      || conversation.sessionId !== missingProviderSessionId
    ) {
      return 'preserve';
    }
    conversation.sessionId = null;
    return 'reset';
  }

  isPendingForkConversation(_conversation: Conversation): boolean {
    return false;
  }

  buildForkProviderState(
    _sourceSessionId: string,
    _resumeAt: string,
    _sourceProviderState?: Record<string, unknown>,
  ): Record<string, unknown> {
    return {};
  }

  buildPersistedProviderState(
    conversation: Conversation,
  ): Record<string, unknown> | undefined {
    return conversation.providerState;
  }
}
