import type {
  ProviderChatUIConfig,
  ProviderPermissionModeToggleConfig,
  ProviderReasoningOption,
  ProviderUIOption,
} from '../../../core/providers/types';
import { AGY_PROVIDER_ICON } from '../../../shared/icons';
import {
  decodeAgyModelId,
  encodeAgyModelId,
  findAgyModel,
  getAgyAvailableReasoningEfforts,
  isAgyModelSelectionId,
  resolveAgyContextWindow,
  resolveAgyDefaultReasoningEffort,
} from '../models';
import {
  getAgyProviderSettings,
  getOrderedAgyVisibleModelIds,
  updateAgyProviderSettings,
} from '../settings';

const AGY_PERMISSION_MODE_TOGGLE: ProviderPermissionModeToggleConfig = {
  inactiveValue: 'normal',
  inactiveLabel: 'Safe',
  activeValue: 'yolo',
  activeLabel: 'YOLO',
  planValue: 'plan',
  planLabel: 'PLAN',
};

export const agyChatUIConfig: ProviderChatUIConfig = {
  getModelOptions(settings): ProviderUIOption[] {
    const agySettings = getAgyProviderSettings(settings);
    const discoveredModels = agySettings.discoveredModels;
    const modelById = new Map(discoveredModels.map(model => [model.rawId, model] as const));
    const visibleModelIds = [...getOrderedAgyVisibleModelIds(agySettings)].reverse();
    const options: ProviderUIOption[] = [];
    const seen = new Set<string>();

    for (const rawId of visibleModelIds) {
      const value = encodeAgyModelId(rawId);
      if (seen.has(value)) {
        continue;
      }
      seen.add(value);
      const model = modelById.get(rawId);
      options.push({
        value,
        label: agySettings.modelAliases[rawId] ?? model?.displayName ?? rawId,
        description: model?.description ?? 'Antigravity AI Model',
      });
    }

    return options;
  },

  getDefaultModel(settings): string | null {
    const agySettings = getAgyProviderSettings(settings);
    const firstVisibleModelId = getOrderedAgyVisibleModelIds(agySettings)[0];
    return firstVisibleModelId ? encodeAgyModelId(firstVisibleModelId) : null;
  },

  ownsModel(model, settings): boolean {
    return isAgyModelSelectionId(model)
      && this.getModelOptions(settings).some(option => option.value === model.trim());
  },

  isAdaptiveReasoningModel(model, settings): boolean {
    const rawId = decodeAgyModelId(model);
    if (!rawId) return false;
    const agySettings = getAgyProviderSettings(settings);
    const found = findAgyModel(agySettings.discoveredModels, rawId);
    return getAgyAvailableReasoningEfforts(found).length > 0;
  },

  getReasoningOptions(model, settings): ProviderReasoningOption[] {
    const rawId = decodeAgyModelId(model);
    if (!rawId) return [];
    const agySettings = getAgyProviderSettings(settings);
    const found = findAgyModel(agySettings.discoveredModels, rawId);
    return getAgyAvailableReasoningEfforts(found).map(option => ({
      ...(option.description ? { description: option.description } : {}),
      label: option.label,
      value: option.value,
    }));
  },

  getDefaultReasoningValue(model, settings): string {
    const agySettings = getAgyProviderSettings(settings);
    const rawId = decodeAgyModelId(model);
    if (!rawId) return '';
    const found = findAgyModel(agySettings.discoveredModels, rawId);
    return resolveAgyDefaultReasoningEffort(found, agySettings.preferredReasoningByModel[rawId]);
  },

  getContextWindowSize(model, customLimits = {}, settings = {}): number {
    const agySettings = getAgyProviderSettings(settings);
    return resolveAgyContextWindow(model, agySettings.discoveredModels, customLimits);
  },

  isDefaultModel(): boolean {
    return false;
  },

  applyModelDefaults(model, settings): void {
    if (!isRecord(settings)) return;
    const normalizedModel = normalizeSelection(model);
    if (!isAgyModelSelectionId(normalizedModel)) return;
    clearSavedAgyEffortProjection(settings);
    settings.model = normalizedModel;
    settings.effortLevel = this.getDefaultReasoningValue(normalizedModel, settings);
  },

  applyModelProjectionDefaults(model, settings): void {
    if (!isRecord(settings)) return;
    clearSavedAgyEffortProjection(settings);
    const rawId = decodeAgyModelId(model);
    if (!rawId) {
      delete settings.effortLevel;
      return;
    }
    settings.effortLevel = this.getDefaultReasoningValue(model, settings);
  },

  applyReasoningSelection(model, value, settings): void {
    if (!isRecord(settings)) return;
    const rawId = decodeAgyModelId(model);
    if (!rawId) {
      clearSavedAgyEffortProjection(settings);
      delete settings.effortLevel;
      return;
    }
    const agySettings = getAgyProviderSettings(settings);
    const preferredReasoningByModel = { ...agySettings.preferredReasoningByModel };
    if (value) {
      preferredReasoningByModel[rawId] = value;
    } else {
      delete preferredReasoningByModel[rawId];
    }
    updateAgyProviderSettings(settings, { preferredReasoningByModel });
  },

  normalizeModelVariant(model): string {
    return normalizeSelection(model);
  },

  getCustomModelIds(): Set<string> {
    return new Set();
  },

  getPermissionModeToggle(): ProviderPermissionModeToggleConfig {
    return AGY_PERMISSION_MODE_TOGGLE;
  },

  resolvePermissionMode(settings): string {
    if (settings.permissionMode === 'plan') return 'plan';
    return settings.permissionMode === 'yolo' ? 'yolo' : 'normal';
  },

  applyPermissionMode(value, settings): void {
    if (isRecord(settings)) {
      settings.permissionMode = value === 'plan' ? 'plan' : value === 'yolo' ? 'yolo' : 'normal';
    }
  },

  getModeSelector(): null {
    return null;
  },

  getProviderIcon() {
    return AGY_PROVIDER_ICON;
  },
};

function normalizeSelection(model: string): string {
  const normalized = model.trim();
  const rawId = decodeAgyModelId(normalized);
  return rawId ? encodeAgyModelId(rawId) : model;
}

function clearSavedAgyEffortProjection(settings: Record<string, unknown>): void {
  if (isRecord(settings.savedProviderEffort)) {
    delete settings.savedProviderEffort.agy;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
