import { create } from 'zustand';

type UiStoreState = {
  assistantComposerText: string;
  setAssistantComposerText: (value: string) => void;
};

export const useUiStore = create<UiStoreState>((set) => ({
  assistantComposerText: '',
  setAssistantComposerText: (value) => set({ assistantComposerText: value })
}));
