import { randomUUID } from 'node:crypto';

import type {
  ProviderExecutionEvent,
  ProviderExecutionInputBlock,
  ProviderExecutionRequest,
  ProviderExecutionRun,
  ProviderExecutionSession,
  ProviderRequestedEventScope,
  ProviderSessionEvent,
  ProviderSessionEventScope,
  ProviderSessionSnapshot,
  ProviderSessionStatus,
} from '../../../core/execution';
import { ManagedStdioProcess } from '../../../core/process/ManagedStdioProcess';
import type { ProviderHost } from '../../../core/providers/ProviderHost';
import { getHostnameKey, parseEnvironmentVariables } from '../../../utils/env';
import { buildContextFromHistory } from '../../../utils/session';
import { decodeAgyModelId } from '../models';
import { getAgyProviderSettings } from '../settings';

class AsyncEventQueue<T> implements AsyncIterable<T> {
  private readonly queue: T[] = [];
  private readonly waiting: Array<(value: IteratorResult<T>) => void> = [];
  private closed = false;

  push(item: T): void {
    if (this.closed) return;
    const resolve = this.waiting.shift();
    if (resolve) {
      resolve({ done: false, value: item });
    } else {
      this.queue.push(item);
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const resolve of this.waiting) {
      resolve({ done: true, value: undefined });
    }
    this.waiting.length = 0;
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: (): Promise<IteratorResult<T>> => {
        if (this.queue.length > 0) {
          return Promise.resolve({ done: false, value: this.queue.shift()! });
        }
        if (this.closed) {
          return Promise.resolve({ done: true, value: undefined });
        }
        return new Promise<IteratorResult<T>>((resolve) => {
          this.waiting.push(resolve);
        });
      },
    };
  }
}

export class AgyExecutionSession implements ProviderExecutionSession {
  readonly providerId = 'agy' as const;
  readonly sessionInstanceId = randomUUID();

  private activeProcess: ManagedStdioProcess | null = null;
  private readonly listeners = new Set<(event: ProviderSessionEvent) => void>();
  private sessionSequence = 0;
  private status: 'idle' | 'executing' | 'cancelling' | 'disposed' = 'idle';

  constructor(
    private readonly host: ProviderHost,
    private readonly vaultWorkingDirectory: string,
    private readonly providerSessionId: string | null,
  ) {}

  execute(request: ProviderExecutionRequest): ProviderExecutionRun {
    const executionId = randomUUID();
    const turnId = randomUUID();
    const eventQueue = new AsyncEventQueue<ProviderExecutionEvent>();
    let sequence = 0;

    const requestSignal = request.signal;
    requestSignal.addEventListener('abort', () => this.cancel(), { once: true });

    this.status = 'executing';
    this.emitSessionEvent();

    const agySettings = getAgyProviderSettings(this.host.settings);
    const hostnameKey = getHostnameKey();
    const customCliPath = agySettings.cliPathsByHost[hostnameKey] || agySettings.cliPath;
    const command = customCliPath.trim() || '/Users/apple/.local/bin/agy';

    const selectedModel = request.configuration.model
      ? (decodeAgyModelId(request.configuration.model) ?? request.configuration.model)
      : 'gemini-3.6-flash';

    let userPromptText = extractInputText(request.input);

    // Build context & current note
    if (request.context?.currentNote?.content) {
      const notePath = request.context.currentNote.path;
      const noteContent = request.context.currentNote.content;
      userPromptText = `[Active Note: ${notePath}]\n\`\`\`markdown\n${noteContent}\n\`\`\`\n\n${userPromptText}`;
    }

    // Build conversation history context
    if (request.conversationHistory && request.conversationHistory.length > 0) {
      const historyContext = buildContextFromHistory([...request.conversationHistory]);
      if (historyContext) {
        userPromptText = `${historyContext}\n\nUser: ${userPromptText}`;
      }
    }

    // Include system instructions if explicit
    if (request.configuration.systemInstructions.kind === 'explicit') {
      userPromptText = `System Instructions:\n${request.configuration.systemInstructions.instructions}\n\n${userPromptText}`;
    } else {
      userPromptText = `System Instructions:\nYou are Claudian, an AI assistant running inside the user's Obsidian vault. You help manage notes, write markdown, answer questions, and assist with coding directly inside Obsidian.\n\n${userPromptText}`;
    }

    const args = [
      '-p',
      userPromptText,
      '--model',
      selectedModel,
    ];

    if (request.configuration.reasoning) {
      args.push('--effort', request.configuration.reasoning);
    } else {
      args.push('--effort', 'high');
    }

    const proc = new ManagedStdioProcess({
      args,
      command,
      cwd: this.vaultWorkingDirectory,
      env: {
        ...process.env,
        ...parseEnvironmentVariables(agySettings.environmentVariables),
      },
    });

    this.activeProcess = proc;

    const makeScope = (): ProviderRequestedEventScope => ({
      executionId,
      kind: 'requested',
      sequence: ++sequence,
      sessionInstanceId: this.sessionInstanceId,
      turnId,
    });

    // Start event sequence
    eventQueue.push({
      accepted: true,
      scope: makeScope(),
      type: 'turn_started',
    });

    eventQueue.push({
      scope: makeScope(),
      type: 'assistant_message_started',
    });

    try {
      proc.start();

      proc.stdout.on('data', (chunk: Buffer | string) => {
        const text = chunk.toString();
        eventQueue.push({
          scope: makeScope(),
          text,
          type: 'text_delta',
        });
      });

      proc.onClose(() => {
        this.status = 'idle';
        this.emitSessionEvent();
        eventQueue.push({
          reason: 'completed',
          scope: makeScope(),
          type: 'turn_completed',
        });
        eventQueue.close();
        this.activeProcess = null;
      });

      proc.onError((err) => {
        this.status = 'idle';
        this.emitSessionEvent();
        eventQueue.push({
          category: 'provider',
          message: err.message,
          recoverable: true,
          scope: makeScope(),
          type: 'execution_error',
        });
        eventQueue.close();
        this.activeProcess = null;
      });
    } catch (err) {
      this.status = 'idle';
      this.emitSessionEvent();
      eventQueue.push({
        category: 'provider',
        message: err instanceof Error ? err.message : String(err),
        recoverable: true,
        scope: makeScope(),
        type: 'execution_error',
      });
      eventQueue.close();
      this.activeProcess = null;
    }

    return {
      executionId,
      turnId,
      events: eventQueue,
      cancel: () => this.cancel(),
    };
  }

  cancel(): void {
    if (this.activeProcess) {
      void this.activeProcess.shutdown();
      this.activeProcess = null;
    }
    this.status = 'idle';
    this.emitSessionEvent();
  }

  getSnapshot(): ProviderSessionSnapshot {
    return Object.freeze({
      providerId: 'agy',
      revision: 1,
      status: this.status,
      ...(this.providerSessionId ? { providerSessionId: this.providerSessionId } : {}),
    });
  }

  getStatus(): ProviderSessionStatus {
    return this.status;
  }

  onEvent(listener: (event: ProviderSessionEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async dispose(): Promise<void> {
    this.cancel();
    this.status = 'disposed';
    this.emitSessionEvent();
    this.listeners.clear();
  }

  private emitSessionEvent(): void {
    const scope: ProviderSessionEventScope = {
      kind: 'session',
      sequence: ++this.sessionSequence,
      sessionInstanceId: this.sessionInstanceId,
    };
    const event: ProviderSessionEvent = {
      scope,
      snapshot: this.getSnapshot(),
      type: 'session_state_changed',
    };
    for (const listener of Array.from(this.listeners)) {
      try {
        listener(event);
      } catch {
        // Ignore listener error
      }
    }
  }
}

function extractInputText(input: readonly ProviderExecutionInputBlock[]): string {
  return input
    .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
    .map(b => b.text)
    .join('\n');
}
