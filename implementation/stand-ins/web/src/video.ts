// Installed in place of the video module when the design leaves out video-calls: the same surface, never connected.
export interface VideoSettings {
  canCapture: () => boolean;
  soundOn: () => boolean;
  modeEvent: string;
}

export class Video {
  readonly connected = false;
  readonly micOn = false;
  readonly camOn = false;
  readonly camUsable = false;
  readonly granted = false;
  readonly stalled = false;

  constructor(_onChange: () => void, _settings: VideoSettings) {}
  connect(_url: string, _token: string, _roomName: string) {}
  disconnect() {}
  hold(_on: boolean) {}
  armIdle() {}
  resume() {}
  setSpeaker(_on: boolean) {}
  setMic(_on: boolean) {}
  setCam(_on: boolean) {}
  hasVideo(_playerId: string, _isMe: boolean): boolean { return false; }
  monitor(_playerId: string, _isMe: boolean, _name: string, _width: number): HTMLElement { return document.createElement("div"); }
}
