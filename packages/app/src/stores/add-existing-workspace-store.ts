import { create } from "zustand";

export interface ExistingWorkspaceTarget {
  serverId: string;
  projectId: string;
  sourceDirectory: string;
}

export interface AddExistingWorkspaceRequest {
  id: number;
  projectName: string;
  targets: ExistingWorkspaceTarget[];
  preferredServerId?: string;
}

interface AddExistingWorkspaceStoreState {
  request: AddExistingWorkspaceRequest | null;
  open: (input: Omit<AddExistingWorkspaceRequest, "id">) => void;
  close: () => void;
}

let nextRequestId = 1;

export const useAddExistingWorkspaceStore = create<AddExistingWorkspaceStoreState>((set) => ({
  request: null,
  open: (input) => set({ request: { ...input, id: nextRequestId++ } }),
  close: () => set({ request: null }),
}));
