// Installed in place of the update check when the design leaves out store-update: there is never an update to offer.
export async function availableUpdate(_current: string, _selection: unknown): Promise<{ version: string; url: string } | null> {
  return null;
}
