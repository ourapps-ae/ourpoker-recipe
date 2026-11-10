// Evaluates recipe conditions with @bufbuild/cel, for the parity test in tests/evaluate_recipe_test.py.
// Install once: npm install --prefix authoring
// stdin: one JSON object per line, { "kinds": { id: "bool" | "int" | "string" | "list(string)" }, "bindings": { id: value },
// "expressions": [CEL, ...] }. stdout: one line per input, { "results": [true | false | { "error": text }, ...] }.
import { createInterface } from "node:readline";
import { isCelError, parse, plan, celEnv } from "@bufbuild/cel";

const env = celEnv();
const plans = new Map();

function planned(expression) {
  if (!plans.has(expression)) plans.set(expression, plan(env, parse(expression)));
  return plans.get(expression);
}

// JSON numbers of int questions become CEL ints (bigint); every other value is passed as read.
function celBindings(kinds, bindings) {
  return Object.fromEntries(Object.entries(bindings).map(([id, value]) => [id, kinds[id] === "int" ? BigInt(value) : value]));
}

for await (const line of createInterface({ input: process.stdin })) {
  if (!line.trim()) continue;
  const { kinds, bindings, expressions } = JSON.parse(line);
  const values = celBindings(kinds, bindings);
  const results = expressions.map((expression) => {
    try {
      const result = planned(expression)(values);
      return isCelError(result) ? { error: result.message } : result;
    } catch (error) {
      return { error: String(error?.message ?? error) };
    }
  });
  process.stdout.write(`${JSON.stringify({ results })}\n`);
}
