import api from '@/lib/api';

export const FILTER_PRESET_FEATURE_KEYS = {
  financialTransactions: 'financial-transactions'
} as const;

export type FilterPresetFeatureKey =
  (typeof FILTER_PRESET_FEATURE_KEYS)[keyof typeof FILTER_PRESET_FEATURE_KEYS];

export interface SavedFilterPreset<TPayload = Record<string, unknown>> {
  id: number;
  name: string;
  featureKey: FilterPresetFeatureKey;
  payload: TPayload;
  createdAt: string;
  updatedAt: string;
}

export interface SavedFilterPresetListResponse<TPayload = Record<string, unknown>> {
  presets: SavedFilterPreset<TPayload>[];
  lastUsedPresetId: number | null;
}

export interface CreateSavedFilterPresetInput<TPayload = Record<string, unknown>> {
  featureKey: FilterPresetFeatureKey;
  name: string;
  payload: TPayload;
}

export interface CreateSavedFilterPresetResponse<TPayload = Record<string, unknown>> {
  preset: SavedFilterPreset<TPayload>;
  lastUsedPresetId: number | null;
}

export interface UpdateLastUsedFilterPresetResponse {
  featureKey: FilterPresetFeatureKey;
  lastUsedPresetId: number | null;
}

export interface DeleteSavedFilterPresetResponse {
  featureKey: FilterPresetFeatureKey;
  lastUsedPresetId: number | null;
}

export async function listSavedFilterPresets<TPayload = Record<string, unknown>>(
  featureKey: FilterPresetFeatureKey
): Promise<SavedFilterPresetListResponse<TPayload>> {
  const response = await api.get('/preferences/filter-presets', {
    params: { featureKey }
  });

  return response.data as SavedFilterPresetListResponse<TPayload>;
}

export async function createSavedFilterPreset<TPayload = Record<string, unknown>>(
  input: CreateSavedFilterPresetInput<TPayload>
): Promise<CreateSavedFilterPresetResponse<TPayload>> {
  const response = await api.post('/preferences/filter-presets', input);
  return response.data as CreateSavedFilterPresetResponse<TPayload>;
}

export async function markLastUsedFilterPreset(
  presetId: number
): Promise<UpdateLastUsedFilterPresetResponse> {
  const response = await api.put(`/preferences/filter-presets/${presetId}/last-used`);
  return response.data as UpdateLastUsedFilterPresetResponse;
}

export async function deleteSavedFilterPreset(
  presetId: number
): Promise<DeleteSavedFilterPresetResponse> {
  const response = await api.delete(`/preferences/filter-presets/${presetId}`);
  return response.data as DeleteSavedFilterPresetResponse;
}
