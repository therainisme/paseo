import { describe, expect, it } from "vitest";

import { buildExpoPushMessages } from "./push-service.js";

describe("buildExpoPushMessages", () => {
  it("builds a content-free task completion notification", () => {
    const messages = buildExpoPushMessages(
      ["ExponentPushToken[first]", "ExponentPushToken[second]"],
      { kind: "task_completed", durationMs: 133_000 },
    );

    expect(messages).toEqual([
      {
        to: "ExponentPushToken[first]",
        title: "任务已完成",
        body: "耗时 2 分 13 秒",
        sound: "default",
      },
      {
        to: "ExponentPushToken[second]",
        title: "任务已完成",
        body: "耗时 2 分 13 秒",
        sound: "default",
      },
    ]);
  });

  it("rejects an invalid duration instead of sending fallback content", () => {
    expect(() =>
      buildExpoPushMessages(["ExponentPushToken[test]"], {
        kind: "task_completed",
        durationMs: Number.NaN,
      }),
    ).toThrow("Push notification duration must be a finite non-negative number");
  });
});
