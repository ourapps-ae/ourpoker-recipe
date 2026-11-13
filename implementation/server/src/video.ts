import type { Services } from "../../components/realtime-rooms/server/index";
import { videoGrant as grant, listRooms, type VideoEnv } from "../../components/video-calls/server/index";
import { settings } from "./settings";
export { listRooms, type VideoEnv };

// The only server module that imports video-calls: the manifest installs it only when the design includes that component.
export function videoGrant(env: VideoEnv, room: string, id: string, name: string, now: number, publish = true) {
  return grant(env, room, id, name, now, publish, settings.roomPrefix);
}

export function createVideoServices(env: object): Pick<Services, "videoGrant"> {
  return { videoGrant: async request => {
    const b = await request.json<{ roomId: string; playerId: string; name: string; now: number; canPublish: boolean }>();
    return Response.json(await videoGrant(env as VideoEnv, b.roomId, b.playerId, b.name, b.now, b.canPublish));
  } };
}

export async function videoRoute(request: Request, env: object, path: string, json: (body: unknown, status?: number) => Response): Promise<Response | null> {
  if (request.method !== "GET" || path !== "/video-rooms") return null;
  return json((await listRooms(env as VideoEnv, Date.now(), settings.roomPrefix)) ?? { error: "video off" });
}
