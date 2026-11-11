// Installed in place of the update links module when the design leaves out store-update: no invitation, no update route.
export function updateLinks(_inviteAddress: string | undefined) {
  return { inviteUrl: null, updateUrl: null };
}

export async function updateRoute(_request: Request, _env: { INVITE_URL?: string }, _path: string, _json: (body: unknown, status?: number) => Response): Promise<Response | null> {
  return null;
}
