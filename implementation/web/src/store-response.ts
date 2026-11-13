import { isNewer } from "../../components/store-update/web/index.ts";

export type UpdateSelection = {
  platform: "web" | "android" | "ios" | "macos" | "tvos" | "windows";
  channel: "web" | "direct" | "testflight";
  origins: readonly string[];
  architecture?: "arm64" | "x64";
  osVersion?: string;
  packageUrl?: string;
  allowLoopback?: boolean;
};
type RecordValue = Record<string, unknown>;
export type StoreUpdate = { version: string; url: string; signing?: "signed" | "unsigned"; notarization?: "notarized" | "not-notarized" };
const record = (value: unknown): value is RecordValue => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const version = (value: unknown): value is string => typeof value === "string" && /^\d+(?:\.\d+){1,3}(?:-[A-Za-z0-9.-]+)?$/.test(value);

function destination(value: unknown, selection: UpdateSelection): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (url.username || url.password || !selection.origins.includes(url.origin)) return null;
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (url.protocol !== "https:" && !(selection.allowLoopback && loopback && url.protocol === "http:")) return null;
    if (selection.channel === "testflight" && (url.origin !== "https://testflight.apple.com" || !/^\/join\/[A-Za-z0-9]+$/.test(url.pathname))) return null;
    return url.href;
  } catch { return null; }
}

export function normalizeStoreUpdate(value: unknown, selection: UpdateSelection, now = Date.now()): StoreUpdate | null {
  if (!record(value)) return null;
  if (value.linksExpireAt !== undefined && (typeof value.linksExpireAt !== "string" || !Number.isFinite(Date.parse(value.linksExpireAt)) || Date.parse(value.linksExpireAt) <= now)) return null;
  let selectedVersion: unknown, selectedUrl: unknown;
  let metadata: Pick<StoreUpdate, "signing" | "notarization"> = {};
  if (selection.platform === "web" && selection.channel === "web") {
    selectedVersion = value.version;
    selectedUrl = value.pwa;
  } else if (selection.platform === "android" && selection.channel === "direct" && record(value.android)) {
    selectedVersion = value.version;
    selectedUrl = value.android.apkUrl;
  } else if (selection.platform === "ios" && selection.channel === "testflight") {
    selectedVersion = value.testflightVersion;
    selectedUrl = value.testflightUrl;
    if (record(value.apple) && "ios" in value.apple) {
      const ready = value.apple.ios;
      if (!record(ready) || ready.version !== selectedVersion || ready.testflightUrl !== selectedUrl) return null;
    }
  } else if (["macos", "tvos"].includes(selection.platform) && selection.channel === "testflight" && record(value.apple)) {
    const ready = value.apple[selection.platform];
    if (!record(ready)) return null;
    selectedVersion = ready.version;
    selectedUrl = ready.testflightUrl;
  } else if (["macos", "windows"].includes(selection.platform) && selection.channel === "direct") {
    const target = value[selection.platform];
    if (!record(target) || !Array.isArray(target.packages) || !selection.architecture || !selection.osVersion || !/^\d+(?:\.\d+){0,3}$/.test(selection.osVersion)) return null;
    const matches = target.packages.filter((pkg): pkg is RecordValue => {
      if (!record(pkg) || pkg.format !== (selection.platform === "macos" ? "dmg" : "exe")) return false;
      if (!Array.isArray(pkg.architectures) || !pkg.architectures.includes(selection.architecture) || new Set(pkg.architectures).size !== pkg.architectures.length || pkg.architectures.some(value => value !== "arm64" && value !== "x64")) return false;
      if (typeof pkg.minOsVersion !== "string" || !/^\d+(?:\.\d+){0,3}$/.test(pkg.minOsVersion) || isNewer(pkg.minOsVersion, selection.osVersion!)) return false;
      if (pkg.signing !== "signed" && pkg.signing !== "unsigned") return false;
      if (selection.platform === "macos" && (pkg.notarization !== "notarized" && pkg.notarization !== "not-notarized" || pkg.signing === "unsigned" && pkg.notarization === "notarized")) return false;
      if (selection.platform === "windows" && pkg.notarization !== undefined) return false;
      return destination(pkg.url, selection) !== null && (selection.packageUrl === undefined || selection.packageUrl === pkg.url);
    });
    if (matches.length !== 1) return null;
    const pkg = matches[0];
    selectedVersion = target.version;
    selectedUrl = pkg.url;
    metadata = { signing: pkg.signing as StoreUpdate["signing"] };
    if (pkg.notarization !== undefined) metadata.notarization = pkg.notarization as StoreUpdate["notarization"];
  } else return null;
  const url = destination(selectedUrl, selection);
  return version(selectedVersion) && url ? { version: selectedVersion, url, ...metadata } : null;
}
