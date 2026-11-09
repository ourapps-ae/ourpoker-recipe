// Lets node import the TypeScript sources of ourapps/shared, which name their relative imports "./x.js".
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && specifier.endsWith(".js")) {
      try {
        return nextResolve(specifier.slice(0, -3) + ".ts", context);
      } catch {
        /* fall back to the name as written */
      }
    }
    return nextResolve(specifier, context);
  },
});
