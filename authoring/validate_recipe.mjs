// Runs the ourapps catalogue validator on recipe.json. Usage: node --import ./authoring/register-ts-js.mjs authoring/validate_recipe.mjs
// The ourapps checkout is OURAPPS, else ../../ourapps beside the recipes folder.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = fileURLToPath(new URL("..", import.meta.url));
const ourapps = process.env.OURAPPS ?? join(here, "..", "..", "ourapps");
const { validateRecipe } = await import(pathToFileURL(join(ourapps, "shared/src/catalogue.ts")).href);
const result = validateRecipe(JSON.parse(readFileSync(here + "recipe.json", "utf8")));
if (!result.ok) {
  for (const error of result.errors) console.error("recipe.json: " + error);
  process.exit(1);
}
const r = result.recipe;
console.log(`recipe.json valid: ${r.name}@${r.version}, ${r.components.length} components, ${r.questions.length} questions, ${r.connections.length} connections, ${r.jobs.length} jobs, ${r.tests.answerSets.length} answer sets`);
