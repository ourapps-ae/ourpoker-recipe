// Installed in place of the video module when the design leaves out video-calls: no video grants and no video room list.
export function createVideoServices(_env: object): Record<string, never> {
  return {};
}

export async function videoRoute(_request: Request, _env: object, _path: string, _json: (body: unknown, status?: number) => Response): Promise<Response | null> {
  return null;
}
