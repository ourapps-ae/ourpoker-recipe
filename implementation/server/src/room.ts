import { createRoomClass, type Actor } from "../../components/realtime-rooms/server/index";
import { pokerAdapter } from "./adapter";
import { createVideoServices } from "./video";
import { updateLinks } from "./update-links";
import { settings } from "./settings";
import { identity } from "./parts";
export { settings } from "./settings";
export { json, POLL_MS, MAX_DISPLAYS, DISPLAY_IDLE_MS, LIVE_MS } from "../../components/realtime-rooms/server/index";

export class Room extends createRoomClass(pokerAdapter({ inviteUrl: null, updateUrl: null }), { identity }, settings) {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.services = { ...this.services, ...createVideoServices(env) };
  }
  protected override view(actor: Actor | null, options = { odds: false }) {
    const v = super.view(actor, options);
    const env = this.env as unknown as Env;
    Object.assign(v, updateLinks(env.INVITE_URL ?? settings.inviteAddress));
    return v;
  }
}
