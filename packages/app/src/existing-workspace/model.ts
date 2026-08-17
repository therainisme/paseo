import type { CheckoutGetWorktreesResponse } from "@getpaseo/protocol/messages";
import { isOpenableProjectPath } from "@/components/project-picker-options";
import { normalizeWorkspacePath } from "@/utils/workspace-identity";

export type CheckoutWorktree = CheckoutGetWorktreesResponse["payload"]["worktrees"][number];

export interface ExistingWorkspacePathOption {
  id: string;
  path: string;
  source: "worktree" | "directory" | "manual";
  worktree: CheckoutWorktree | null;
}

export function existingWorkspacePathKey(path: string): string {
  const normalized = normalizeWorkspacePath(path) ?? path.trim();
  return /^[A-Za-z]:\//.test(normalized) || normalized.startsWith("//")
    ? normalized.toLowerCase()
    : normalized;
}

export function buildExistingWorkspacePathOptions(input: {
  worktrees: CheckoutWorktree[];
  directorySuggestions: string[];
  query: string;
}): ExistingWorkspacePathOption[] {
  const query = input.query.trim();
  const normalizedQuery = query.toLocaleLowerCase();
  const options: ExistingWorkspacePathOption[] = [];
  const seen = new Set<string>();

  for (const worktree of input.worktrees) {
    if (
      normalizedQuery &&
      !worktree.path.toLocaleLowerCase().includes(normalizedQuery) &&
      !worktree.branch?.toLocaleLowerCase().includes(normalizedQuery)
    ) {
      continue;
    }
    const key = existingWorkspacePathKey(worktree.path);
    if (seen.has(key)) continue;
    seen.add(key);
    options.push({
      id: `worktree:${worktree.path}`,
      path: worktree.path,
      source: "worktree",
      worktree,
    });
  }

  if (isOpenableProjectPath(query)) {
    const key = existingWorkspacePathKey(query);
    if (!seen.has(key)) {
      seen.add(key);
      options.push({ id: `manual:${query}`, path: query, source: "manual", worktree: null });
    }
  }

  for (const path of input.directorySuggestions) {
    const key = existingWorkspacePathKey(path);
    if (seen.has(key)) continue;
    seen.add(key);
    options.push({ id: `directory:${path}`, path, source: "directory", worktree: null });
  }

  return options;
}

export function checkoutRepositoryIdentity(status: {
  isGit: boolean;
  repoRoot: string | null;
  mainRepoRoot?: string | null;
}): string | null {
  if (!status.isGit || !status.repoRoot) return null;
  return existingWorkspacePathKey(status.mainRepoRoot ?? status.repoRoot);
}

export function isMatchingCheckoutRepository(
  source: { isGit: boolean; repoRoot: string | null; mainRepoRoot?: string | null },
  candidate: { isGit: boolean; repoRoot: string | null; mainRepoRoot?: string | null },
): boolean {
  const sourceIdentity = checkoutRepositoryIdentity(source);
  return sourceIdentity !== null && sourceIdentity === checkoutRepositoryIdentity(candidate);
}
