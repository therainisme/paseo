import { create } from "zustand";

export interface WorkspaceBranchPickerRequest {
  id: number;
  serverId: string;
  workspaceId: string;
  workspaceDirectory: string;
  currentBranch: string | null;
}

interface WorkspaceBranchPickerStoreState {
  request: WorkspaceBranchPickerRequest | null;
  open: (input: Omit<WorkspaceBranchPickerRequest, "id">) => void;
  close: () => void;
}

let nextRequestId = 1;

export const useWorkspaceBranchPickerStore = create<WorkspaceBranchPickerStoreState>((set) => ({
  request: null,
  open: (input) => set({ request: { ...input, id: nextRequestId++ } }),
  close: () => set({ request: null }),
}));
