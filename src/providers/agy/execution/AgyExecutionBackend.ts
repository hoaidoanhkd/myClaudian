import type {
  ProviderExecutionBackend,
  ProviderExecutionSession,
  ProviderSessionConfig,
} from '../../../core/execution';
import type { ProviderHost } from '../../../core/providers/ProviderHost';
import type { AgyWorkspaceServices } from '../app/AgyWorkspaceServices';
import { AgyExecutionSession } from './AgyExecutionSession';

type AgyExecutionServices = Pick<AgyWorkspaceServices, 'commandCatalog'>;

export class AgyExecutionBackend implements ProviderExecutionBackend {
  readonly providerId = 'agy' as const;

  constructor(
    private readonly host: ProviderHost,
    private readonly _services: AgyExecutionServices,
  ) {}

  createSession(config: ProviderSessionConfig): ProviderExecutionSession {
    const sessionId = config.resumeSeed?.providerSessionId ?? null;
    return new AgyExecutionSession(
      this.host,
      config.vaultWorkingDirectory,
      sessionId,
    );
  }
}
