// What this application tells the display-mode and video-calls components (the recipe's own component
// provides both configuration ports). Values come from the design's answers when the application is assembled.
export const displayModeConfiguration = { initialMode: "player" as const, eventName: "{{modeEvent}}" };

// The design's look: the theme of both rooms and every screen, and the card backs.
export const look = { theme: "{{look}}", cardBack: "{{cardBack}}" as "stripes" | "plain" };

export const videoCallsConfiguration = { roomPrefix: "{{roomPrefix}}", eventName: "{{modeEvent}}" };
