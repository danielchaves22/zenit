import api from './api';

export interface HabitualExpensePreference {
  configured: boolean;
  categoryIds: number[];
  categories: Array<{ id: number; name: string; color: string; parentId: number | null }>;
  access: { canRead: boolean; canManage: boolean };
}

export async function getHabitualExpensePreference(): Promise<HabitualExpensePreference> {
  return (await api.get('/financial/preferences/habitual-expenses')).data;
}

export async function saveHabitualExpensePreference(
  categoryIds: number[]
): Promise<HabitualExpensePreference> {
  return (await api.put('/financial/preferences/habitual-expenses', { categoryIds })).data;
}
