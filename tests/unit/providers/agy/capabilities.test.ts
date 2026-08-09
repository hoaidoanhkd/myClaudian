import { AGY_PROVIDER_CAPABILITIES } from '@/providers/agy/capabilities';

describe('AGY_PROVIDER_CAPABILITIES', () => {
  it('exposes the AGY provider capabilities contract', () => {
    expect(AGY_PROVIDER_CAPABILITIES).toEqual({
      providerId: 'agy',
      reasoningControl: 'effort',
      supportsFork: true,
      supportsImageAttachments: true,
      supportsInstructionMode: true,
      supportsMcpTools: true,
      supportsNativeHistory: true,
      supportsPlanMode: true,
      supportsProviderCommands: true,
      supportsRewind: true,
      supportsTurnSteer: true,
    });
  });
});
