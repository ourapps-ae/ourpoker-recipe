// What this application tells the display-mode and video-calls components (the recipe's own component
// provides both configuration ports). Values come from the design's answers when the application is assembled.
export const displayModeConfiguration = { initialMode: "player" as const, eventName: "{{modeEvent}}" };

export const videoCallsConfiguration = { roomPrefix: "{{roomPrefix}}", eventName: "{{modeEvent}}" };
