import { DurableObject } from "cloudflare:workers";
import { createDirectoryClass } from "../../components/room-directory/server/directory";
import { ROOM_IDS } from "./contract";

// The room list, kept under the same DIRECTORY binding and storage key the rooms already write to.
export class Directory extends createDirectoryClass(DurableObject, { roomIds: ROOM_IDS, maxConnections: 1000 }) {}
