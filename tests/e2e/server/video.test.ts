import { describe, expect, it } from "vitest";
import { videoGrant } from "../src/video";
import { settings } from "../src/settings";

describe("video grant", () => {
  it("is null without LiveKit secrets", async () => {
    expect(await videoGrant({}, "casino", "p1", "Ann", Date.now())).toBeNull();
  });

  it("signs a token for the poker room", async () => {
    const g = await videoGrant({ LIVEKIT_URL: "wss://x.livekit.cloud", LIVEKIT_API_KEY: "key", LIVEKIT_API_SECRET: "secret" }, "casino", "p1", "Ann", Date.now(), false);
    expect(g!.room).toBe(`${settings.roomPrefix}casino`);
    const payload = JSON.parse(atob(g!.token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    expect(payload.video.room).toBe(`${settings.roomPrefix}casino`);
    expect(payload.video.canPublish).toBe(false);
  });
});
