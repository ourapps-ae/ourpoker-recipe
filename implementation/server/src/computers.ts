import { createComputers, type ComputerMode } from "../../components/computer-players/server/computers";
import { createStrategy } from "../../components/poker-strategy/server/index";
import { settings } from "./settings";

type Deps = Parameters<typeof createComputers>[1];

// The only server module that imports computer-players and poker-strategy (the recipe includes both or neither): the manifest
// installs it only when the design includes them. Computer players sit under the component's own names at human pace; the answer to
// the computer players question is the component's `mode`: none, on-request or fill-empty.
export function createComputerPlayers(deps: { odds: Parameters<typeof createStrategy>[0]["odds"]; clock: Deps["clock"]; seating: Deps["seating"] }) {
  return createComputers({ mode: settings.computerPlayers as ComputerMode }, { strategy: createStrategy({ odds: deps.odds }), clock: deps.clock, seating: deps.seating });
}
