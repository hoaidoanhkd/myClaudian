import {
  formatReasoningValueLabel,
  resolvePreferredReasoningDefault,
  STANDARD_REASONING_VALUES,
} from '../../core/providers/reasoning';

export interface AgyReasoningEffort {
  description?: string;
  label: string;
  value: string;
}

export interface AgyDiscoveredModel {
  agentType?: string;
  contextWindow?: number;
  defaultReasoningEffort?: string;
  description?: string;
  displayName: string;
  rawId: string;
  reasoningMetadataResolved?: boolean;
  reasoningEfforts: AgyReasoningEffort[];
  supportsReasoning: boolean;
}

export const AGY_MODEL_PREFIX = 'agy/';
export const AGY_CONTEXT_WINDOW_FALLBACK = 200_000;

export const DEFAULT_AGY_MODELS: readonly AgyDiscoveredModel[] = Object.freeze([
  {
    displayName: 'Gemini 3.6 Flash',
    rawId: 'gemini-3.6-flash',
    description: 'Google Gemini 3.6 Flash via Antigravity',
    contextWindow: 1_000_000,
    supportsReasoning: true,
    reasoningEfforts: STANDARD_REASONING_VALUES.map(value => ({
      label: formatReasoningValueLabel(value),
      value,
    })),
  },
  {
    displayName: 'Gemini 3.5 Flash',
    rawId: 'gemini-3.5-flash',
    description: 'Fast Google Gemini 3.5 Flash via Antigravity',
    contextWindow: 1_000_000,
    supportsReasoning: true,
    reasoningEfforts: STANDARD_REASONING_VALUES.map(value => ({
      label: formatReasoningValueLabel(value),
      value,
    })),
  },
  {
    displayName: 'Gemini 3.1 Pro',
    rawId: 'gemini-3.1-pro',
    description: 'Google Gemini 3.1 Pro Flagship Reasoning',
    contextWindow: 1_000_000,
    supportsReasoning: true,
    reasoningEfforts: STANDARD_REASONING_VALUES.map(value => ({
      label: formatReasoningValueLabel(value),
      value,
    })),
  },
  {
    displayName: 'Claude Sonnet 4.6',
    rawId: 'claude-sonnet-4.6',
    description: 'Anthropic Claude Sonnet 4.6 via Antigravity',
    contextWindow: 200_000,
    supportsReasoning: true,
    reasoningEfforts: STANDARD_REASONING_VALUES.map(value => ({
      label: formatReasoningValueLabel(value),
      value,
    })),
  },
  {
    displayName: 'Claude Opus 4.6',
    rawId: 'claude-opus-4.6',
    description: 'Anthropic Claude Opus 4.6 via Antigravity',
    contextWindow: 200_000,
    supportsReasoning: true,
    reasoningEfforts: STANDARD_REASONING_VALUES.map(value => ({
      label: formatReasoningValueLabel(value),
      value,
    })),
  },
  {
    displayName: 'GPT-OSS 120B',
    rawId: 'gpt-oss-120b',
    description: 'Open Source GPT-OSS 120B via Antigravity',
    contextWindow: 128_000,
    supportsReasoning: false,
    reasoningEfforts: [],
  },
]);

export function isAgyModelSelectionId(model: string): boolean {
  return decodeAgyModelId(model.trim()) !== null;
}

export function encodeAgyModelId(rawModelId: string): string {
  const normalized = rawModelId.trim();
  if (!normalized || normalized === AGY_MODEL_PREFIX) {
    return '';
  }
  return normalized.startsWith(AGY_MODEL_PREFIX)
    ? normalized
    : `${AGY_MODEL_PREFIX}${normalized}`;
}

export function decodeAgyModelId(model: string): string | null {
  const normalized = model.trim();
  if (!normalized.startsWith(AGY_MODEL_PREFIX)) {
    return null;
  }
  const rawModelId = normalized.slice(AGY_MODEL_PREFIX.length).trim();
  return rawModelId || null;
}

export function normalizeAgyDiscoveredModels(value: unknown): AgyDiscoveredModel[] {
  const normalizedById = new Map<string, AgyDiscoveredModel>();
  for (const defaultModel of DEFAULT_AGY_MODELS) {
    normalizedById.set(defaultModel.rawId, defaultModel);
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      const model = normalizeAgyDiscoveredModel(entry);
      if (model) {
        normalizedById.set(model.rawId, model);
      }
    }
  }

  return Array.from(normalizedById.values());
}

export function findAgyModel(
  models: AgyDiscoveredModel[],
  modelId: string,
): AgyDiscoveredModel | null {
  const rawModelId = decodeAgyModelId(modelId) ?? modelId.trim();
  if (!rawModelId) {
    return null;
  }
  return models.find(model => model.rawId === rawModelId) ?? null;
}

export function getAgyAvailableReasoningEfforts(
  model: AgyDiscoveredModel | null | undefined,
): readonly AgyReasoningEffort[] {
  if (!model || !model.supportsReasoning) {
    return [];
  }
  return model.reasoningEfforts;
}

export function resolveAgyDefaultReasoningEffort(
  model: AgyDiscoveredModel | null | undefined,
  preferredEffort?: string,
): string {
  const availableValues = model?.reasoningEfforts.map(effort => effort.value) ?? [];
  const normalizedPreferred = preferredEffort?.trim();
  if (normalizedPreferred && availableValues.includes(normalizedPreferred)) {
    return normalizedPreferred;
  }

  return resolvePreferredReasoningDefault(availableValues, 'medium');
}

export function resolveAgyContextWindow(
  modelId: string,
  models: AgyDiscoveredModel[],
  customContextLimits: Record<string, number> = {},
): number {
  const model = findAgyModel(models, modelId);
  if (model?.contextWindow) return model.contextWindow;
  const rawModelId = decodeAgyModelId(modelId) ?? modelId;
  const customLimit = customContextLimits[modelId] ?? customContextLimits[rawModelId];
  return typeof customLimit === 'number' && customLimit > 0
    ? customLimit
    : AGY_CONTEXT_WINDOW_FALLBACK;
}

function normalizeAgyDiscoveredModel(value: unknown): AgyDiscoveredModel | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const rawId = typeof record.rawId === 'string' ? record.rawId.trim() : '';
  if (!rawId) {
    return null;
  }

  const displayName = typeof record.displayName === 'string' && record.displayName.trim()
    ? record.displayName.trim()
    : rawId;

  const reasoningEfforts: AgyReasoningEffort[] = Array.isArray(record.reasoningEfforts)
    ? record.reasoningEfforts.flatMap((item): AgyReasoningEffort[] => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
      const itemRecord = item as Record<string, unknown>;
      const val = typeof itemRecord.value === 'string' ? itemRecord.value.trim() : '';
      if (!val) return [];
      const lbl = typeof itemRecord.label === 'string' && itemRecord.label.trim()
        ? itemRecord.label.trim()
        : formatReasoningValueLabel(val);
      return [{ label: lbl, value: val }];
    })
    : [];

  const contextWindow = typeof record.contextWindow === 'number' && record.contextWindow > 0
    ? record.contextWindow
    : undefined;

  return {
    displayName,
    rawId,
    description: typeof record.description === 'string' ? record.description.trim() : undefined,
    ...(contextWindow ? { contextWindow } : {}),
    supportsReasoning: Boolean(record.supportsReasoning),
    reasoningEfforts,
  };
}
