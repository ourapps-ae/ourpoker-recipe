import { expect, it } from "vitest";
import type { VideoGrant } from "../../components/video-calls/server/index";
import { createVideoServices } from "../src/video";
import { settings } from "../src/settings";

it("binds video grants to each room environment and preserves spectator permissions and expiry", async () => {
  const first = createVideoServices({ LIVEKIT_URL: "wss://first.example", LIVEKIT_API_KEY: "test-first", LIVEKIT_API_SECRET: "synthetic-first" });
  const second = createVideoServices({ LIVEKIT_URL: "wss://second.example", LIVEKIT_API_KEY: "test-second", LIVEKIT_API_SECRET: "synthetic-second" });
  const request = (canPublish: boolean) => new Request("https://service/grant", { method: "POST", body: JSON.stringify({ roomId: "casino", playerId: "test-player", name: "Test", now: 10_000, canPublish }) });
  for (const [service, url, issuer, publish] of [[first, "wss://first.example", "test-first", true], [second, "wss://second.example", "test-second", false]] as const) {
    const grant = await (await service.videoGrant!(request(publish))).json() as NonNullable<VideoGrant>;
    expect(grant.url).toBe(url); expect(grant.room).toBe(`${settings.roomPrefix}casino`);
    const payload = JSON.parse(atob(grant.token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    expect(payload).toMatchObject({ iss: issuer, sub: "test-player", name: "Test", iat: 10, exp: 21610, video: { room: `${settings.roomPrefix}casino`, canPublish: publish, canSubscribe: true, canPublishData: false } });
  }
  expect(await (await createVideoServices({}).videoGrant!(request(true))).json()).toBeNull();
});
