import { describe, expect, it } from "vitest";
import {
  buildExistingWorkspacePathOptions,
  existingWorkspacePathKey,
  isMatchingCheckoutRepository,
  type CheckoutWorktree,
} from "./model";

const worktree: CheckoutWorktree = {
  path: "/worktrees/auth/packages/app",
  worktreeRoot: "/worktrees/auth",
  branch: "feature/auth",
  head: "0123456789abcdef",
  isMainCheckout: false,
  isPaseoOwnedWorktree: false,
  isPrunable: false,
};

describe("existing workspace picker model", () => {
  it("searches worktrees by branch and deduplicates directory suggestions", () => {
    expect(
      buildExistingWorkspacePathOptions({
        worktrees: [worktree],
        directorySuggestions: [worktree.path, "/worktrees/other"],
        query: "auth",
      }),
    ).toEqual([
      {
        id: `worktree:${worktree.path}`,
        path: worktree.path,
        source: "worktree",
        worktree,
      },
      {
        id: "directory:/worktrees/other",
        path: "/worktrees/other",
        source: "directory",
        worktree: null,
      },
    ]);
  });

  it("offers an absolute manual path before daemon suggestions", () => {
    expect(
      buildExistingWorkspacePathOptions({
        worktrees: [],
        directorySuggestions: ["/worktrees/suggested"],
        query: "/outside/custom",
      }).map((option) => option.source),
    ).toEqual(["manual", "directory"]);
  });

  it("normalizes Windows drive and UNC paths for duplicate detection", () => {
    expect(existingWorkspacePathKey("C:\\Users\\Dev\\Repo\\")).toBe("c:/users/dev/repo");
    expect(existingWorkspacePathKey("\\\\HOST\\Share\\Repo")).toBe("//host/share/repo");
  });

  it("compares linked worktrees by their common main checkout", () => {
    expect(
      isMatchingCheckoutRepository(
        { isGit: true, repoRoot: "/repo", mainRepoRoot: null },
        { isGit: true, repoRoot: "/worktrees/auth", mainRepoRoot: "/repo" },
      ),
    ).toBe(true);
    expect(
      isMatchingCheckoutRepository(
        { isGit: true, repoRoot: "/repo", mainRepoRoot: null },
        { isGit: true, repoRoot: "/other", mainRepoRoot: null },
      ),
    ).toBe(false);
  });
});
