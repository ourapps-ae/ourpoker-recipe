// Runs the ourapps catalogue validator on recipe.json. Usage: node --import ./authoring/register-ts-js.mjs authoring/validate_recipe.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL("..", import.meta.url));
const { validateRecipe } = await import("../../../ourapps/shared/src/catalogue.ts");
const result = validateRecipe(JSON.parse(readFileSync(here + "recipe.json", "utf8")));
if (!result.ok) {
  for (const error of result.errors) console.error("recipe.json: " + error);
  process.exit(1);
}
const r = result.recipe;
console.log(`recipe.json valid: ${r.name}@${r.version}, ${r.components.length} components, ${r.questions.length} questions, ${r.connections.length} connections, ${r.jobs.length} jobs, ${r.tests.answerSets.length} answer sets`);
