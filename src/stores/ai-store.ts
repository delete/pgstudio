import { create } from "zustand";
import type { AIConfigResponse } from "@/lib/tauri";

interface AIState {
  configured: boolean;
  onboardingDone: boolean;
  aiConfig: AIConfigResponse | null;
  setConfigured: (configured: boolean) => void;
  setOnboardingDone: (done: boolean) => void;
  setAiConfig: (config: AIConfigResponse | null) => void;
}

export const useAIStore = create<AIState>((set) => ({
  configured: false,
  onboardingDone: false,
  aiConfig: null,
  setConfigured: (configured) => set({ configured }),
  setOnboardingDone: (done) => set({ onboardingDone: done }),
  setAiConfig: (config) => set({ aiConfig: config }),
}));
