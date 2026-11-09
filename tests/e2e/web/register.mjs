import { registerHooks } from "node:module";
import { readFileSync } from "node:fs";
import ts from "typescript";

registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "livekit-client") return { url: new URL("./fake-livekit.mjs", import.meta.url).href, shortCircuit: true };
    if (specifier.startsWith(".") && context.parentURL?.endsWith(".ts") && !/\.[a-z]+$/.test(specifier)) {
      return next(`${specifier}.ts`, context);
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.endsWith(".ts")) {
      const source = readFileSync(new URL(url), "utf8").replaceAll("import.meta.env", '({ DEV: false, VITE_DESKTOP: "0" })');
      return { format: "module", shortCircuit: true, source: ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText };
    }
    if (url.endsWith("/src/strings.json")) return { format: "module", shortCircuit: true, source: `export default ${readFileSync(new URL(url), "utf8")}` };
    return next(url, context);
  },
});
