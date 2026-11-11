// Filled in from the design's answers when the application is assembled.
// The server host's own settings (provider, account reference, allowed origins, room prefix, region) are not here:
// aepm renders them into components/server-host/server/host-settings.ts (see index.ts).
export const settings = {
  applicationId: "{{applicationId}}",
  allowedOrigins: ["{{webAddress}}", "{{scheme}}://app"],
  webOrigin: "{{webAddress}}",
  nativeOrigin: "{{scheme}}://app",
  roomPrefix: "{{roomPrefix}}",
  updatesEnabled: {{updatesEnabled}} as boolean,
  // The store invitation used when the room service has none of its own (env INVITE_URL).
  inviteAddress: "{{inviteAddress}}",
  // The answers that change the house rules (see rules.ts).
  maximumPlayers: {{maximumPlayers}},
  startingStack: {{startingStack}},
  levelSeconds: {{levelSeconds}},
  rebuysPerPlayer: {{rebuysPerPlayer}},
  decisionSeconds: {{decisionSeconds}},
  computerPlayers: "{{computerPlayers}}",
};
