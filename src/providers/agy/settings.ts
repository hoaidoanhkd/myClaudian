import { getProviderConfig, setProviderConfig } from '../../core/providers/providerConfig';
import { getProviderEnvironmentVariables } from '../../core/providers/providerEnvironment';
import { normalizeHostnameStringMap } from '../../core/providers/settings/HostnameStringMap';
import {
  readStoredBoolean,
  readStoredString,
} from '../../core/providers/settings/storedSettings';
import type { HostnameCliPaths } from '../../core/types/settings';
import { getHostnameKey } from '../../utils/env';
import {
  type AgyDiscoveredModel,
  decodeAgyModelId,
  DEFAULT_AGY_MODELS,
  encodeAgyModelId,
  isAgyModelSelectionId,
  normalizeAgyDiscoveredModels,
} from './models';

export interface PersistedAgyProviderSettings {
  cliPath: string;
  cliPathsByHost: HostnameCliPaths;
  discoveredModels: AgyDiscoveredModel[];
  enabled: boolean;
  environmentHash: string;
  environmentVariables: string;
  modelAliases: Record<string, string>;
  preferredReasoningByModel: Record<string, string>;
  visibleModels: string[];
}

export type AgyProviderSettings = PersistedAgyProviderSettings;

export const DEFAULT_AGY_PROVIDER_SETTINGS: Readonly<PersistedAgyProviderSettings> = Object.freeze({
  cliPath: '',
  cliPathsByHost: {},
  discoveredModels: [...DEFAULT_AGY_MODELS],
  enabled: false,
  environmentHash: '',
  environmentVariables: '',
  modelAliases: {},
  preferredReasoningByModel: {},
  visibleModels: DEFAULT_AGY_MODELS.map(m => encodeAgyModelId(m.rawId)),
});

export function getAgyProviderSettings(settings: Record<string, unknown>): AgyProviderSettings {
  const config = getProviderConfig(settings, 'agy');
  const cliPathsByHost = normalizeHostnameStringMap(config.cliPathsByHost);
  const discoveredModels = normalizeAgyDiscoveredModels(config.discoveredModels);
  const visibleModels = normalizeAgyVisibleModels(config.visibleModels, discoveredModels);

  return {
    cliPath: readStoredString(config.cliPath, DEFAULT_AGY_PROVIDER_SETTINGS.cliPath),
    cliPathsByHost,
    discoveredModels,
    enabled: readStoredBoolean(config.enabled, DEFAULT_AGY_PROVIDER_SETTINGS.enabled),
    environmentHash: readStoredString(
      config.environmentHash,
      DEFAULT_AGY_PROVIDER_SETTINGS.environmentHash,
    ),
    environmentVariables: readStoredString(
      config.environmentVariables,
      getProviderEnvironmentVariables(settings, 'agy')
        ?? DEFAULT_AGY_PROVIDER_SETTINGS.environmentVariables,
    ),
    modelAliases: normalizeStringRecord(config.modelAliases),
    preferredReasoningByModel: normalizeStringRecord(config.preferredReasoningByModel),
    visibleModels,
  };
}

export function updateAgyProviderSettings(
  settings: Record<string, unknown>,
  updates: Partial<AgyProviderSettings>,
): AgyProviderSettings {
  const current = getAgyProviderSettings(settings);
  const hostnameKey = getHostnameKey();
  const nextDiscoveredModels = normalizeAgyDiscoveredModels(
    updates.discoveredModels ?? current.discoveredModels,
  );
  const nextVisibleModels = normalizeAgyVisibleModels(
    updates.visibleModels ?? current.visibleModels,
    nextDiscoveredModels,
  );
  const nextCliPathsByHost = 'cliPathsByHost' in updates
    ? normalizeHostnameStringMap(updates.cliPathsByHost)
    : { ...current.cliPathsByHost };

  let nextCliPath = 'cliPathsByHost' in updates
    ? (typeof updates.cliPath === 'string' ? updates.cliPath.trim() : DEFAULT_AGY_PROVIDER_SETTINGS.cliPath)
    : current.cliPath.trim();

  if ('cliPath' in updates && !('cliPathsByHost' in updates)) {
    const trimmed = typeof updates.cliPath === 'string' ? updates.cliPath.trim() : '';
    if (trimmed) {
      nextCliPathsByHost[hostnameKey] = trimmed;
    } else {
      delete nextCliPathsByHost[hostnameKey];
    }
    nextCliPath = DEFAULT_AGY_PROVIDER_SETTINGS.cliPath;
  }

  const next: AgyProviderSettings = {
    ...current,
    ...updates,
    cliPath: nextCliPath,
    cliPathsByHost: nextCliPathsByHost,
    discoveredModels: nextDiscoveredModels,
    visibleModels: nextVisibleModels,
  };

  setProviderConfig(settings, 'agy', {
    cliPath: next.cliPath,
    cliPathsByHost: next.cliPathsByHost,
    discoveredModels: next.discoveredModels,
    enabled: next.enabled,
    environmentHash: next.environmentHash,
    environmentVariables: next.environmentVariables,
    modelAliases: next.modelAliases,
    preferredReasoningByModel: next.preferredReasoningByModel,
    visibleModels: next.visibleModels,
  });

  return next;
}

export function normalizeAgyVisibleModels(
  value: unknown,
  discoveredModels: AgyDiscoveredModel[] = [],
): string[] {
  const allDiscoveredIds = discoveredModels.map(m => encodeAgyModelId(m.rawId));
  if (!Array.isArray(value)) {
    return allDiscoveredIds;
  }

  const knownIds = new Set(allDiscoveredIds);
  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== 'string') {
      continue;
    }

    const trimmed = entry.trim();
    if (!trimmed || !isAgyModelSelectionId(trimmed)) {
      continue;
    }
    if (knownIds.size > 0 && !knownIds.has(trimmed)) {
      continue;
    }
    if (seen.has(trimmed)) {
      continue;
    }

    seen.add(trimmed);
    normalized.push(trimmed);
  }

  for (const id of allDiscoveredIds) {
    if (!seen.has(id)) {
      seen.add(id);
      normalized.push(id);
    }
  }

  return normalized.length > 0
    ? normalized
    : allDiscoveredIds;
}

export function getOrderedAgyVisibleModelIds(settings: AgyProviderSettings): string[] {
  return settings.visibleModels.map(id => decodeAgyModelId(id) ?? id);
}

function normalizeStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => typeof v === 'string' && v.trim())
      .map(([k, v]) => [k, (v as string).trim()]),
  );
}
