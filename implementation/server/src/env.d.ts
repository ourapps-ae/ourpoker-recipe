// The bindings and variables the worker reads: server-host's wrangler.jsonc on Cloudflare, its start.ts on Node.
declare namespace Cloudflare {
  interface Env {
    ROOM: DurableObjectNamespace;
    DIRECTORY: DurableObjectNamespace;
    CODE_VERSION?: string;
    WEB_ORIGINS?: string;
    POLL_MS?: string;
    INVITE_URL?: string;
    LIVEKIT_URL?: string;
    LIVEKIT_API_KEY?: string;
    LIVEKIT_API_SECRET?: string;
  }
}
interface Env extends Cloudflare.Env {}
