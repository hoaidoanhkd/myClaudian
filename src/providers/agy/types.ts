export interface AgyModelReasoningOption {
  description?: string;
  label: string;
  value: string;
}

export interface AgyDiscoveredModel {
  description?: string;
  displayName: string;
  rawId: string;
  reasoningEfforts?: AgyModelReasoningOption[];
  supportsReasoning?: boolean;
}

export interface AgyModelCatalog {
  models: AgyDiscoveredModel[];
  timestamp: number;
}
