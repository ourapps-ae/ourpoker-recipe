import { fetchUpdate, isNewer } from "../../components/store-update/web/update";
import { SERVER } from "./api";
import { normalizeStoreUpdate, type UpdateSelection } from "./store-response";

export async function checkStoreUpdate(current: string, selection: UpdateSelection | null, enabled: boolean, endpoint: string, fetcher: typeof fetch = fetch) {
  if (!enabled || selection === null) return null;
  const latest = await fetchUpdate(endpoint, async (input, init) => {
    const response = await fetcher(input, { ...init, redirect: "error" });
    if (!response.ok || response.redirected) return new Response(null, { status: 502 });
    const normalized = normalizeStoreUpdate(await response.json(), selection);
    return Response.json(normalized ?? {});
  });
  return latest && isNewer(latest.version, current) ? latest : null;
}

export function availableUpdate(current: string, selection: UpdateSelection | null) {
  return checkStoreUpdate(current, selection, "{{updatesEnabled}}" === "true", `${SERVER}/update`);
}
