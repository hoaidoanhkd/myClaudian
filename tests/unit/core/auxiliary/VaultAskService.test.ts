import { VaultAskService } from '@/core/auxiliary/VaultAskService';
import { ProviderExecutionLifecycleRegistry } from '@/core/execution';

import {
  FakeAuxiliaryBackend,
  waitFor,
} from './AuxiliaryExecutionTestHarness';

function createService() {
  const backend = new FakeAuxiliaryBackend();
  const lifecycleRegistry = new ProviderExecutionLifecycleRegistry();
  const service = new VaultAskService({
    backend,
    interactionPort: {
      askUserQuestion: jest.fn(),
      dismissInteraction: jest.fn(),
      requestApproval: jest.fn(),
      requestPlanDecision: jest.fn(),
    },
    lifecycleRegistry,
    vaultWorkingDirectory: '/vault',
  });
  return { backend, lifecycleRegistry, service };
}

describe('VaultAskService', () => {
  it('asks the vault with a read-only ephemeral session and streams the answer', async () => {
    const { backend, service } = createService();
    const progress = jest.fn();
    const result = service.askVault('Which note mentions the roadmap?', progress);
    await waitFor(() => backend.sessions[0]?.requests.length === 1);

    expect(backend.configs[0]).toMatchObject({
      lifecycle: 'ephemeral',
      nativePersistence: 'disabled-if-supported',
    });
    expect(backend.sessions[0].requests[0]).toMatchObject({
      configuration: { systemInstructions: { kind: 'explicit' } },
      input: [{ text: 'Which note mentions the roadmap?', type: 'text' }],
      toolPolicy: { kind: 'read-only' },
    });

    backend.sessions[0].emitText('Roadmap.md mentions it.');
    backend.sessions[0].complete();

    await expect(result).resolves.toEqual({
      answer: 'Roadmap.md mentions it.',
      success: true,
    });
    expect(progress).toHaveBeenCalledWith('Roadmap.md mentions it.');
    expect(backend.sessions[0].disposeCalls).toBe(1);
  });

  it('returns a failure result when the provider returns no answer', async () => {
    const { backend, service } = createService();
    const result = service.askVault('Anything about X?');
    await waitFor(() => backend.sessions[0]?.requests.length === 1);

    backend.sessions[0].complete();

    await expect(result).resolves.toEqual({
      error: 'No answer was returned.',
      success: false,
    });
  });

  it('returns a failure result when the session fails', async () => {
    const { backend, service } = createService();
    const result = service.askVault('Anything about X?');
    await waitFor(() => backend.sessions[0]?.requests.length === 1);

    backend.sessions[0].fail('provider unavailable');

    await expect(result).resolves.toEqual({
      error: 'provider unavailable',
      success: false,
    });
    expect(backend.sessions[0].disposeCalls).toBe(1);
  });

  it('delegates cancel() to the underlying controller', async () => {
    const { backend, service } = createService();
    const result = service.askVault('Anything about X?');
    await waitFor(() => backend.sessions[0]?.requests.length === 1);

    service.cancel();

    await expect(result).resolves.toEqual({ error: 'Cancelled', success: false });
    expect(backend.sessions[0].cancelCalls).toBeGreaterThan(0);
    expect(backend.sessions[0].disposeCalls).toBe(1);
  });
});
