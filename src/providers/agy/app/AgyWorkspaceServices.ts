import type { ProviderCommandCatalog } from '../../../core/providers/commands/ProviderCommandCatalog';
import type { ProviderHost } from '../../../core/providers/ProviderHost';
import { ProviderWorkspaceRegistry } from '../../../core/providers/ProviderWorkspaceRegistry';
import type {
  ProviderTabWarmupPolicy,
  ProviderWorkspaceRegistration,
  ProviderWorkspaceServices,
} from '../../../core/providers/types';
import { AgyCommandCatalog } from '../commands/AgyCommandCatalog';
import { agySettingsTabRenderer } from '../ui/AgySettingsTab';

export interface AgyWorkspaceServices extends ProviderWorkspaceServices {
  commandCatalog: ProviderCommandCatalog;
  prepareSettings(): Promise<void>;
  dispose(): Promise<void>;
}

const agyTabWarmupPolicy: ProviderTabWarmupPolicy = {
  resolveMode() {
    return 'none';
  },
};

export async function createAgyWorkspaceServices(
  _plugin: ProviderHost,
): Promise<AgyWorkspaceServices> {
  const commandCatalog = new AgyCommandCatalog();

  return {
    commandCatalog,
    settingsTabRenderer: agySettingsTabRenderer,
    tabWarmupPolicy: agyTabWarmupPolicy,
    async prepareSettings() {},
    async dispose() {},
  };
}

export const agyWorkspaceRegistration: ProviderWorkspaceRegistration<AgyWorkspaceServices> = {
  initialize: async ({ plugin }) => createAgyWorkspaceServices(plugin),
};

export function getAgyWorkspaceServices(): AgyWorkspaceServices {
  return ProviderWorkspaceRegistry.requireServices('agy') as AgyWorkspaceServices;
}
