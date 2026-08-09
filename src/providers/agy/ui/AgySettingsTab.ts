import * as fs from 'node:fs';
import * as path from 'node:path';

import { Setting } from 'obsidian';

import { ProviderSettingsCoordinator } from '../../../core/providers/ProviderSettingsCoordinator';
import type {
  ProviderSettingsTabRenderer,
  ProviderSettingsTabRendererContext,
} from '../../../core/providers/types';
import { t } from '../../../i18n/i18n';
import { renderEnvironmentSettingsSection } from '../../../shared/settings/EnvironmentSettingsSection';
import { renderHostnameCliPathSetting } from '../../../shared/settings/HostnameCliPathSetting';
import { renderNativeMcpSettingsSection } from '../../../shared/settings/NativeMcpSettingsSection';
import { renderProviderEnablementSetting } from '../../../shared/settings/ProviderEnablementSetting';
import {
  renderLastEnabledProviderWarning,
  renderProviderModelEnablementWarning,
} from '../../../shared/settings/ProviderModelEnablementWarning';
import {
  type ProviderModelPickerController,
  type ProviderModelPickerModel,
  type ProviderModelPickerState,
  renderProviderModelPicker,
} from '../../../shared/settings/ProviderModelPicker';
import { getHostnameKey } from '../../../utils/env';
import { expandHomePath } from '../../../utils/path';
import { type AgyDiscoveredModel, encodeAgyModelId } from '../models';
import {
  getAgyProviderSettings,
  getOrderedAgyVisibleModelIds,
  normalizeAgyVisibleModels,
  updateAgyProviderSettings,
} from '../settings';

const AGY_PROVIDER_ID = 'agy' as const;

export const agySettingsTabRenderer: ProviderSettingsTabRenderer = {
  render(container, context) {
    const settingsBag = context.plugin.settings as unknown as Record<string, unknown>;
    const hostnameKey = getHostnameKey();

    // --- Setup ---

    new Setting(container).setName(t('settings.setup')).setHeading();

    renderProviderEnablementSetting({
      container,
      description: t('settings.providerEnablement.desc', { provider: 'Antigravity (AGY)' }),
      getValue: () => getAgyProviderSettings(settingsBag).enabled,
      name: t('settings.providerEnablement.name', { provider: 'Antigravity (AGY)' }),
      onChange: async (enabled) => {
        if (!ProviderSettingsCoordinator.canApplyProviderEnablement(
          settingsBag,
          AGY_PROVIDER_ID,
          enabled,
        )) {
          lastProviderWarning.showFor();
          return;
        }

        let accepted = true;
        await context.plugin.runProviderExecutionTransition(
          [AGY_PROVIDER_ID],
          async () => context.plugin.mutateSettings((settings) => {
            accepted = ProviderSettingsCoordinator.applyProviderEnablement(
              settings,
              AGY_PROVIDER_ID,
              enabled,
            );
          }),
        );
        if (accepted) {
          lastProviderWarning.hide();
        } else {
          lastProviderWarning.showFor();
        }
        modelWarning.context.notifyProviderModelOptionsChanged(AGY_PROVIDER_ID);
      },
    });

    const lastProviderWarning = renderLastEnabledProviderWarning(container);

    const modelWarning = renderProviderModelEnablementWarning(container, context, {
      getHasEnabledModels: () => getAgyProviderSettings(settingsBag).visibleModels.length > 0,
      getIsEnabled: () => getAgyProviderSettings(settingsBag).enabled,
      providerId: AGY_PROVIDER_ID,
      providerName: 'Antigravity (AGY)',
    });

    renderHostnameCliPathSetting({
      container,
      description: 'Optional absolute path to the agy CLI for this computer. Leave empty to use `agy` from PATH.',
      getValue: () => {
        const current = getAgyProviderSettings(settingsBag);
        return current.cliPathsByHost[hostnameKey] ?? current.cliPath ?? '';
      },
      name: 'CLI path',
      onChange: async (value) => {
        const cliPathsByHost = {
          ...getAgyProviderSettings(settingsBag).cliPathsByHost,
        };
        if (value) {
          cliPathsByHost[hostnameKey] = value;
        } else {
          delete cliPathsByHost[hostnameKey];
        }
        await context.plugin.applyProviderRuntimeSettings(
          [AGY_PROVIDER_ID],
          (settings) => {
            updateAgyProviderSettings(settings, {
              cliPath: '',
              cliPathsByHost,
            });
          },
          () => {},
        );
        modelWarning.context.notifyProviderModelOptionsChanged(AGY_PROVIDER_ID);
      },
      placeholder: process.platform === 'win32'
        ? 'C:\\Users\\you\\AppData\\Roaming\\npm\\agy.cmd'
        : '/Users/apple/.local/bin/agy',
      validate: validateCliPath,
    });

    // --- Models ---

    new Setting(container).setName(t('settings.models')).setHeading();
    renderAgyModelPicker(container, modelWarning.context, settingsBag);

    // --- Skills ---

    new Setting(container).setName(t('settings.agentSkills.sectionTitle')).setHeading();
    context.renderAgentSkillSettings(container, AGY_PROVIDER_ID);

    new Setting(container).setName('Commands').setHeading();
    context.renderHiddenProviderCommandSetting(container, AGY_PROVIDER_ID, {
      name: 'Hidden AGY commands',
      desc: 'Hide runtime commands advertised by AGY from the command dropdown. Enter names without the leading slash, one per line.',
      placeholder: 'agent\nmodels',
    });

    // --- MCP Servers ---

    renderNativeMcpSettingsSection(container, {
      descriptionAfterCommand: ' to configure native MCP servers for Antigravity.',
      descriptionBeforeCommand: 'Run ',
      documentationLabel: 'Learn more about Antigravity MCP',
      documentationUrl: 'https://github.com/google/antigravity',
      heading: t('settings.mcpServers.name'),
      setupCommand: 'agy mcp',
    });

    // --- Environment ---

    renderEnvironmentSettingsSection({
      container,
      desc: 'Environment variables passed only to AGY.',
      heading: t('settings.environment'),
      name: 'AGY environment variables',
      placeholder: 'AGY_LOG_LEVEL=debug',
      plugin: context.plugin,
      scope: 'provider:agy',
      renderCustomContextLimits: (target) => context.renderCustomContextLimits(target, AGY_PROVIDER_ID),
    });
  },
};

function renderAgyModelPicker(
  container: HTMLElement,
  context: ProviderSettingsTabRendererContext,
  settingsBag: Record<string, unknown>,
): ProviderModelPickerController {
  const getState = (): ProviderModelPickerState => {
    const settings = getAgyProviderSettings(settingsBag);
    const discoveredModels = settings.discoveredModels;
    const selectedIds = getOrderedAgyVisibleModelIds(settings);
    const defaultModelId = selectedIds.length > 0 ? selectedIds[0] : null;

    return {
      aliases: settings.modelAliases,
      defaultModelId,
      discoveredCount: discoveredModels.length,
      models: buildAgyPickerModels(discoveredModels, selectedIds),
      selectedIds,
    };
  };

  return renderProviderModelPicker({
    container,
    emptyCatalogText: 'No AGY models discovered yet.',
    failedCatalogText: 'Could not load AGY models.',
    getState,
    loadCatalog: async () => 'loaded',
    loadingCatalogText: 'Loading AGY model catalog...',
    modifier: 'agy',
    async onAliasesChange(modelAliases) {
      await context.plugin.mutateSettings((settings) => {
        updateAgyProviderSettings(settings, { modelAliases });
      });
      context.notifyProviderModelOptionsChanged(AGY_PROVIDER_ID);
    },
    async onSelectedIdsChange(selectedIds) {
      const current = getAgyProviderSettings(settingsBag);
      const normalized = normalizeAgyVisibleModels(selectedIds, current.discoveredModels);
      await context.plugin.mutateSettings((settings) => {
        updateAgyProviderSettings(settings, { visibleModels: normalized });
      });
      context.notifyProviderModelOptionsChanged(AGY_PROVIDER_ID);
    },
    providerName: 'Antigravity (AGY)',
    searchPlaceholder: 'Filter by model name, description, or ID...',
  });
}

function buildAgyPickerModels(
  discoveredModels: AgyDiscoveredModel[],
  selectedIds: string[],
): ProviderModelPickerModel[] {
  const defaultRawId = discoveredModels.length > 0 ? discoveredModels[0].rawId : null;
  const models: ProviderModelPickerModel[] = discoveredModels.map(model => ({
    ...(model.rawId === defaultRawId ? { catalogBadge: 'Default' } : {}),
    description: model.description,
    id: encodeAgyModelId(model.rawId),
    isAvailable: true,
    name: model.displayName,
  }));
  const catalogIds = new Set(discoveredModels.map(model => model.rawId));
  for (const rawId of selectedIds) {
    if (catalogIds.has(rawId)) {
      continue;
    }
    const encoded = encodeAgyModelId(rawId);
    models.push({
      description: 'Selected model',
      id: encoded,
      isAvailable: false,
      name: rawId,
      unavailableMessage: 'Not currently reported by AGY',
    });
  }
  return models;
}

function validateCliPath(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const expandedPath = expandHomePath(trimmed);
  if (!path.posix.isAbsolute(expandedPath) && !path.win32.isAbsolute(expandedPath)) {
    return 'Path must be absolute';
  }
  try {
    if (!fs.existsSync(expandedPath)) {
      return 'Path does not exist';
    }
    if (!fs.statSync(expandedPath).isFile()) {
      return 'Path must point to a file';
    }
  } catch {
    return 'Path is not accessible';
  }
  return null;
}
