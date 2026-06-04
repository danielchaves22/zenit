import * as SecureStore from 'expo-secure-store';
import { SSO_STORAGE_KEYS } from '@zenit/shared-users-core';

export async function readStoredToken() {
  return SecureStore.getItemAsync(SSO_STORAGE_KEYS.token);
}

export async function readStoredRefreshToken() {
  return SecureStore.getItemAsync(SSO_STORAGE_KEYS.refreshToken);
}

export async function readStoredCompanyId(): Promise<number | null> {
  const raw = await SecureStore.getItemAsync(SSO_STORAGE_KEYS.companyId);
  if (!raw) {
    return null;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function persistSession(params: {
  token: string;
  refreshToken: string;
  companyId?: number | null;
}) {
  await SecureStore.setItemAsync(SSO_STORAGE_KEYS.token, params.token);
  await SecureStore.setItemAsync(SSO_STORAGE_KEYS.refreshToken, params.refreshToken);

  if (params.companyId === null || params.companyId === undefined) {
    await SecureStore.deleteItemAsync(SSO_STORAGE_KEYS.companyId);
  } else {
    await SecureStore.setItemAsync(SSO_STORAGE_KEYS.companyId, String(params.companyId));
  }
}

export async function persistCompanyId(companyId: number) {
  await SecureStore.setItemAsync(SSO_STORAGE_KEYS.companyId, String(companyId));
}

export async function clearPersistedSession() {
  await Promise.all([
    SecureStore.deleteItemAsync(SSO_STORAGE_KEYS.token),
    SecureStore.deleteItemAsync(SSO_STORAGE_KEYS.refreshToken),
    SecureStore.deleteItemAsync(SSO_STORAGE_KEYS.companyId),
    SecureStore.deleteItemAsync(SSO_STORAGE_KEYS.mustChangePassword)
  ]);
}
