import { expect, it, vi } from "vitest";
import * as update from "../../components/store-update/server/store";
import { updateLinks } from "../src/update-links";

const invitation = "https://store.example/l/0123456789abcdef01234567";
it("passes undefined to the update component and suppresses invitations when disabled", () => {
  const spy = vi.spyOn(update, "updateUrlFor");
  try {
    expect(updateLinks(invitation, false)).toEqual({ inviteUrl: null, updateUrl: null });
    expect(spy).toHaveBeenLastCalledWith(undefined);
    expect(updateLinks(invitation, true)).toEqual({ inviteUrl: invitation, updateUrl: "https://store.example/api/public/links/0123456789abcdef01234567/latest" });
    expect(spy).toHaveBeenLastCalledWith(invitation);
  } finally { spy.mockRestore(); }
});
