import { createCliPathFingerprintInputs } from '../../../core/providers/cli/CliPathFingerprintInputs';
import { getRuntimeEnvironmentText } from '../../../core/providers/providerEnvironment';
import { createRuntimeInputFingerprint } from '../../../core/providers/settings/RuntimeInputFingerprint';
import type { ProviderSettingsReconciler } from '../../../core/providers/types';
import { getHostnameKey, parseEnvironmentVariables } from '../../../utils/env';
import { decodeAgyModelId, encodeAgyModelId } from '../models';
import { getAgyProviderSettings, updateAgyProviderSettings } from '../settings';

export function computeAgyEnvironmentHash(settings: Record<string, unknown>): string {
  const providerSettings = getAgyProviderSettings(settings);
  const cliPathInputs = createCliPathFingerprintInputs(
    providerSettings.cliPathsByHost[getHostnameKey()],
    providerSettings.cliPath,
  );
  const environment = Object.entries(parseEnvironmentVariables(
    getRuntimeEnvironmentText(settings, 'agy'),
  )).sort(([left], [right]) => left.localeCompare(right));
  return createRuntimeInputFingerprint({
    additionalInputs: cliPathInputs,
    environmentKeys: environment.map(([key]) => key),
    environmentText: getRuntimeEnvironmentText(settings, 'agy'),
  });
}

export const agySettingsReconciler: ProviderSettingsReconciler = {
  environmentSessionPolicy: 'reload',

  invalidateConversationSessions: () => [],

  reconcileModelWithEnvironment(settings) {
    if (!getAgyProviderSettings(settings).enabled) {
      return { changed: false, invalidatedConversations: [] };
    }

    const environmentHash = computeAgyEnvironmentHash(settings);
    if (getAgyProviderSettings(settings).environmentHash === environmentHash) {
      return { changed: false, invalidatedConversations: [] };
    }

    updateAgyProviderSettings(settings, { environmentHash });
    return { changed: true, invalidatedConversations: [] };
  },

  normalizeModelVariantSettings(settings): boolean {
    let changed = false;
    changed = normalizeSelectionAt(settings, 'model') || changed;
    changed = normalizeSelectionAt(settings, 'titleGenerationModel') || changed;

    const savedProviderModel = settings.savedProviderModel;
    if (savedProviderModel && typeof savedProviderModel === 'object' && !Array.isArray(savedProviderModel)) {
      changed = normalizeSelectionAt(
        savedProviderModel as Record<string, unknown>,
        'agy',
      ) || changed;
    }
    return changed;
  },
};

function normalizeSelectionAt(settings: Record<string, unknown>, key: string): boolean {
  const current = settings[key];
  if (typeof current !== 'string') {
    return false;
  }

  const trimmed = current.trim();
  let normalized: string | null = null;
  const rawModelId = decodeAgyModelId(trimmed);
  if (rawModelId) {
    normalized = encodeAgyModelId(rawModelId);
  }

  if (normalized === null || normalized === current) {
    return false;
  }
  settings[key] = normalized;
  return true;
}
