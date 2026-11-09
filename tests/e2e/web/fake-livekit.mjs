export const RoomEvent = { TrackSubscribed: "subscribed", TrackUnsubscribed: "unsubscribed", TrackMuted: "muted", TrackUnmuted: "unmuted", ParticipantDisconnected: "left", Disconnected: "disconnected" };
export const Track = { Kind: { Video: "video", Audio: "audio" }, Source: { Camera: "camera" } };
export class Room {
  static all = [];
  static connecting = null;
  static microphone = null;
  static camera = null;
  static denied = false;
  static failing = false;
  handlers = new Map();
  disconnected = 0;
  stopped = 0;
  microphoneCalls = [];
  cameraCalls = [];
  localParticipant = {
    identity: "me",
    trackPublications: new Map([["track", { track: { stop: () => this.stopped++ } }]]),
    setMicrophoneEnabled: async (on) => { this.microphoneCalls.push(on); await Room.microphone; if (Room.denied) throw new Error("No microphone"); },
    setCameraEnabled: async (on) => { this.cameraCalls.push(on); await Room.camera; if (Room.denied) throw new Error("No camera"); },
    getTrackPublication: () => null,
  };
  constructor() { Room.all.push(this); }
  on(event, callback) { this.handlers.set(event, callback); return this; }
  async connect() { await Room.connecting; if (Room.failing) throw new Error("Connection failed"); }
  emit(event, ...args) { this.handlers.get(event)?.(...args); }
  async disconnect() { this.disconnected++; this.localParticipant.trackPublications.forEach((pub) => pub.track.stop()); }
}
