// The house rules file is the one place the game's numbers live. The design's answers (see settings.ts) are written
// over six of its values when the server starts, and every component below is built from the result. Workers have no
// file access, so the file and its schema are imported as data and checked with the rules-settings checker.
import base from "../../rules/texas-holdem-house-rules.json" with { type: "json" };
import schema from "../../rules/texas-holdem-house-rules.schema.json" with { type: "json" };
import { createRulesSettings, validate } from "../../components/rules-settings/web/index";
import { settings } from "./settings";

type Rules = typeof base;

export function withAnswers(rules: Rules, answers: Pick<typeof settings, "maximumPlayers" | "startingStack" | "levelSeconds" | "rebuysPerPlayer" | "decisionSeconds">): Rules {
  const out = structuredClone(rules);
  out.players.maximum = answers.maximumPlayers;
  out.chips.starting_stack = answers.startingStack;
  out.rebuy.stack_awarded = answers.startingStack;
  out.blinds.level_duration_seconds = answers.levelSeconds;
  out.rebuy.maximum_per_player = answers.rebuysPerPlayer;
  out.timing.decision_seconds = answers.decisionSeconds;
  return out;
}

export const house: Rules = withAnswers(base, settings);

const problems = validate(house, schema as never, { strict: false });
if (problems.length) throw new Error(`House rules are not valid: ${problems.map((p) => `${p.path} ${p.message}`).join("; ")}`);

// rules-settings' reader over the checked rules: `value(path)` is what the turn engine and holdem-rules call.
export const rules = createRulesSettings(house);
