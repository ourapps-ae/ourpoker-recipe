import { updateUrlFor } from "../../components/store-update/server/store";
import { settings } from "./settings";

// The only server module that imports store-update: the manifest installs it only when the design includes that component.
export function updateLinks(inviteAddress: string | undefined, enabled = settings.updatesEnabled) {
  const invitation = enabled ? inviteAddress : undefined;
  return { inviteUrl: invitation ?? null, updateUrl: updateUrlFor(invitation) };
}

// `json` is realtime-rooms' response helper, passed in by index.ts.
export async function updateRoute(request: Request, env: { INVITE_URL?: string }, path: string, json: (body: unknown, status?: number) => Response): Promise<Response | null> {
  if (request.method !== "GET" || path !== "/update") return null;
  const target = updateLinks(env.INVITE_URL ?? settings.inviteAddress).updateUrl;
  if (!target) return json({ error: "badRequest", message: "No store link configured." }, 404);
  const r = await fetch(target, { headers: { accept: "application/json" } });
  return new Response(r.body, { status: r.status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}
