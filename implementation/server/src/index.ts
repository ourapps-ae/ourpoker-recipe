import { createServerHost } from "../../components/server-host/server/host";
import { createWorker, json } from "../../components/realtime-rooms/server/index";
import { updateRoute } from "./update-links";
import { videoRoute } from "./video";
import { ROOM_IDS } from "./contract";
import { Room as RoomBase, settings } from "./room";
import { Directory as DirectoryBase } from "./directory";
// aepm renders this file at install from the server-host settings (provider, account reference, allowed origins, room prefix, region).
import { serverSettings } from "../../components/server-host/server/host-settings";

// The web client, the native apps' own origin (not an http address, so the host takes it as a pattern),
// and web copies served by the library on a subdomain.
const originPatterns = [new RegExp(`^${settings.nativeOrigin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`), /^https:\/\/[0-9a-f]{16,64}\.ourapps\.app$/];
const host = createServerHost(serverSettings());

export const Room = host.objectClass(RoomBase);
export const Directory = host.objectClass(DirectoryBase);
export const allowed = (origin: string | null, webOrigins = ""): origin is string => {
  if (!origin) return false;
  return host.settings.allowedOrigins.includes(origin) || originPatterns.some((p) => p.test(origin)) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) || webOrigins.split(" ").includes(origin);
};

const worker = createWorker(host.roomsSettings(settings.applicationId), ROOM_IDS, async (request, bindings) => {
  const env = bindings as unknown as Env, path = new URL(request.url).pathname;
  return (await updateRoute(request, env, path, json)) ?? (await videoRoute(request, env, path, json));
});

export default host.entry(worker, { originPatterns });
