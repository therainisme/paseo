import { describe, expect, test } from "vitest";
import {
  ServerInfoStatusPayloadSchema,
  SessionInboundMessageSchema,
  SessionOutboundMessageSchema,
} from "./messages.js";

describe("checkout worktree listing protocol", () => {
  test("parses the correlated request and response", () => {
    const request = {
      type: "checkout.get_worktrees.request" as const,
      cwd: "/repo/packages/app",
      requestId: "req-worktrees",
    };
    const response = {
      type: "checkout.get_worktrees.response" as const,
      payload: {
        cwd: "/repo/packages/app",
        mainRepoRoot: "/repo",
        worktrees: [
          {
            path: "/worktrees/feature/packages/app",
            worktreeRoot: "/worktrees/feature",
            branch: "feature/auth",
            head: "0123456789abcdef",
            isMainCheckout: false,
            isPaseoOwnedWorktree: false,
            isPrunable: false,
          },
        ],
        error: null,
        requestId: "req-worktrees",
      },
    };

    expect(SessionInboundMessageSchema.parse(request)).toEqual(request);
    expect(SessionOutboundMessageSchema.parse(response)).toEqual(response);
  });

  test("advertises checkout worktree listing independently", () => {
    expect(
      ServerInfoStatusPayloadSchema.parse({
        status: "server_info",
        serverId: "srv_test",
        features: { checkoutWorktreeList: true },
      }).features,
    ).toEqual({ checkoutWorktreeList: true });
  });
});
