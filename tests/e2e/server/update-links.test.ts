import { expect, it } from "vitest";
import { updateLinks } from "../src/update-links";

const invitation = "https://ourapps.app/l/0123456789abcdef01234567";
it("offers an invitation only when updates are on and it is an invitation link", () => {
  expect(updateLinks(invitation, false)).toEqual({ inviteUrl: null, updateUrl: null });
  expect(updateLinks(invitation, true)).toEqual({ inviteUrl: invitation, updateUrl: "https://ourapps.app/api/public/links/0123456789abcdef01234567/latest" });
  // The setting's local default (the web address) is no invitation: nothing is offered.
  expect(updateLinks("http://localhost:5173", true)).toEqual({ inviteUrl: null, updateUrl: null });
  expect(updateLinks(undefined, true)).toEqual({ inviteUrl: null, updateUrl: null });
});
