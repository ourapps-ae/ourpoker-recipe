// The package-root suite: what can be checked from the package alone, without assembling the application.
// Rules file against its schema, text in every language, lesson keys, the asset list, the manifest's file
// and destination map, the wire fixtures and the configuration example.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";
import { configurations, defaults, windowsDesktopConfiguration } from "../examples/configuration.ts";

const root = new URL("../", import.meta.url).pathname;
const json = (path: string) => JSON.parse(readFileSync(join(root, path), "utf8"));
const LANGUAGES = ["en", "fr", "de", "es"];

function walk(directory: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(directory).sort()) {
    if (name === ".DS_Store") continue;
    const full = join(directory, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(relative(root, full).split("\\").join("/"));
  }
  return out;
}

// ---- a JSON Schema subset: the keywords the rules schema uses ----

type Schema = Record<string, any>;

function check(value: unknown, schema: Schema, path: string, problems: string[]): void {
  const kind = (v: unknown) => (v === null ? "null" : Array.isArray(v) ? "array" : Number.isInteger(v) ? "integer" : typeof v);
  if ("const" in schema && value !== schema.const) problems.push(`${path} must be ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.includes(value)) problems.push(`${path} must be one of ${schema.enum.join(", ")}`);
  if (schema.type) {
    const actual = kind(value);
    const ok = schema.type === actual || (schema.type === "number" && actual === "integer");
    if (!ok) return void problems.push(`${path} must be ${schema.type}, is ${actual}`);
  }
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) problems.push(`${path} is below ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) problems.push(`${path} is above ${schema.maximum}`);
  }
  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) problems.push(`${path} is too short`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) problems.push(`${path} does not match ${schema.pattern}`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) problems.push(`${path} needs ${schema.minItems} items`);
    if (schema.items) value.forEach((item, i) => check(item, schema.items, `${path}[${i}]`, problems));
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const object = value as Record<string, unknown>;
    for (const key of schema.required ?? []) if (!(key in object)) problems.push(`${path}.${key} is missing`);
    for (const [key, sub] of Object.entries<Schema>(schema.properties ?? {})) if (key in object) check(object[key], sub, `${path}.${key}`, problems);
  }
}

const placeholders = (text: string) => [...new Set([...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort();

// ---- house rules ----

test("the house rules file parses and matches its schema", () => {
  const rules = json("rules/texas-holdem-house-rules.json");
  const schema = json("rules/texas-holdem-house-rules.schema.json");
  const problems: string[] = [];
  check(rules, schema, "rules", problems);
  assert.deepEqual(problems, []);
  assert.ok(rules.players.minimum <= rules.players.maximum);
  const blinds = rules.blinds.levels;
  assert.ok(blinds.length > 1);
  blinds.forEach((level: { level: number; small_blind: number; big_blind: number }, i: number) => {
    assert.equal(level.level, i + 1);
    assert.ok(level.big_blind >= level.small_blind);
    if (i) assert.ok(level.big_blind > blinds[i - 1].big_blind, "blinds rise every level");
  });
});

test("the rules documentation names the rules file", () => {
  const text = readFileSync(join(root, "rules/texas-holdem-house-rules.md"), "utf8");
  assert.ok(text.length > 500);
  assert.match(text, /house rules/i);
});

// ---- text ----

test("every string has every language and the same placeholders in each", () => {
  const strings = json("locales/strings.json");
  const keys = Object.keys(strings);
  assert.ok(keys.length > 200);
  for (const key of keys) {
    assert.match(key, /^[A-Za-z][A-Za-z0-9_]*$/, key);
    assert.deepEqual(Object.keys(strings[key]).sort(), [...LANGUAGES].sort(), `${key} languages`);
    for (const language of LANGUAGES) assert.equal(typeof strings[key][language], "string", `${key} ${language}`);
    const sets = new Set(LANGUAGES.map((l) => placeholders(strings[key][l]).join(",")));
    assert.equal(sets.size, 1, `${key} placeholders differ between languages`);
  }
});

test("every lesson step names strings that exist, and lessons are well formed", () => {
  const strings = json("locales/strings.json");
  const lessons = json("locales/lessons.json");
  assert.equal(lessons.format, 1);
  assert.equal(lessons.lessons.length, 12);
  const ids = new Set<string>();
  for (const lesson of lessons.lessons) {
    assert.match(lesson.id, /^[a-z][a-z0-9-]{0,47}$/);
    assert.ok(!ids.has(lesson.id), `${lesson.id} twice`);
    ids.add(lesson.id);
    if (lesson.screen !== undefined) assert.match(lesson.screen, /^[a-z][a-z0-9-]{0,47}$/);
    assert.ok(lesson.steps.length > 0);
    for (const step of lesson.steps) {
      assert.ok(step.title in strings, `${lesson.id}: ${step.title}`);
      assert.ok(step.text in strings, `${lesson.id}: ${step.text}`);
      assert.match(step.anchor, /^[A-Za-z][A-Za-z0-9_-]{0,47}$/);
    }
  }
  for (const id of ["home", "lobby", "bots", "table", "blinds", "call", "bet", "pot", "flop", "turn", "river"]) assert.ok(ids.has(id), `lesson ${id}`);
});

test("the strings the screens ask for by name exist", () => {
  const strings = json("locales/strings.json");
  const keys = Object.keys(strings);
  const missing = new Set<string>();
  for (const file of walk(join(root, "implementation"))) {
    if (!/\.(ts|swift|kt)$/.test(file)) continue;
    for (const m of readFileSync(join(root, file), "utf8").matchAll(/\bL\(\s*"([A-Za-z0-9_]+)"/g)) {
      // "ev_" and the like start a key that is finished at run time; "key" is a parameter name in the lookup helpers.
      const exact = !m[1].endsWith("_") && m[1] !== "key";
      if (exact ? !(m[1] in strings) : m[1] !== "key" && !keys.some((k) => k.startsWith(m[1]))) missing.add(`${file}: ${m[1]}`);
    }
  }
  assert.deepEqual([...missing], []);
});

// ---- assets ----

test("the asset list matches the files, each under 5 MB, with generic names", () => {
  const list = json("assets/ASSETS.json");
  const onDisk = walk(join(root, "assets")).filter((f) => f !== "assets/ASSETS.json").map((f) => f.slice("assets/".length));
  assert.deepEqual(list.files.map((f: { path: string }) => f.path).sort(), onDisk.sort());
  for (const entry of list.files) {
    const bytes = readFileSync(join(root, "assets", entry.path));
    assert.equal(bytes.length, entry.bytes, entry.path);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), entry.sha256, entry.path);
    assert.ok(bytes.length < list.maximumBytes, `${entry.path} is over 5 MB`);
    assert.match(entry.path, /^[A-Za-z0-9_.@/-]+$/, entry.path);
  }
});

test("every sound the manifest names is a file, and every file is a cue", () => {
  const manifest = json("assets/web/sounds-manifest.json");
  const files = readdirSync(join(root, "assets/sounds")).sort();
  assert.deepEqual(Object.values<string>(manifest.cues).sort(), files);
  for (const steps of Object.values<any[]>(manifest.events)) for (const step of steps) assert.ok((typeof step === "string" ? step : step.cue) in manifest.cues);
  for (const name of [...Object.keys(manifest.cues), ...Object.keys(manifest.events)]) assert.match(name, /^[a-z][a-z0-9_-]{0,47}$/, `sound-cues rejects the name ${name}`);
});

test("every art file the web manifest lists exists", () => {
  for (const name of json("assets/web/manifest.json")) assert.ok(statSync(join(root, "assets/web/art", name)).isFile(), name);
});

// ---- the manifest ----

// Present in the package as installed; a staging copy made from the file list alone has no manifest to read.
test("the manifest lists every packaged file, and every artefact has a source and a unique destination", { skip: !existsSync(join(root, "component.json")) && "no component.json beside the tests" }, () => {
  const manifest = json("component.json");
  const listed = manifest.files.map((f: { path: string }) => f.path);
  const unpackaged = new Set([".git", ".gitignore", ".opencode", "authoring", "scripts", "component.json", "AGENTS.md", "REVIEW.md"]);
  const onDisk = walk(root).filter((f) => !unpackaged.has(f.split("/")[0]));
  assert.deepEqual([...listed].sort(), onDisk.sort());
  const destinations = new Set<string>();
  const settings = new Set(manifest.collect.map((s: { id: string }) => s.id));
  for (const artefact of manifest.artefacts) {
    assert.ok(listed.includes(artefact.source), artefact.source);
    for (const name of "component" in artefact ? [artefact.component].flat() : []) assert.ok(json("recipe.json").components.some((c: { name: string }) => c.name === name), `${artefact.source}: ${name} is not a component of the recipe`);
    assert.ok(!artefact.destination.startsWith("components/"), `${artefact.destination} is inside components/`);
    // a stand-in shares its destination with the real file: one is installed with the component, the other without it
    const key = artefact.destination.toLowerCase() + ("withoutComponent" in artefact ? " without" : "");
    assert.ok(!destinations.has(key), `${artefact.destination} twice`);
    destinations.add(key);
    if ("withoutComponent" in artefact && !artefact.source.endsWith(".swift")) assert.ok(manifest.artefacts.some((a: { destination: string; component?: string }) => a.destination === artefact.destination && a.component === artefact.withoutComponent), `${artefact.source} stands in for no file`);
    const text = readFileSync(join(root, artefact.source), artefact.template ? "utf8" : undefined);
    if (artefact.template) for (const m of (text as string).matchAll(/\{\{([A-Za-z][A-Za-z0-9_.-]*)\}\}/g)) assert.ok(settings.has(m[1]), `${artefact.source} names ${m[1]}`);
  }
  assert.equal(manifest.kind, "recipe");
  assert.equal(manifest.identity.name, "ourapps-ae/ourpoker");
});

test("code that imports components names only folders the recipe's components provide", () => {
  const recipe = json("recipe.json");
  const names = new Set<string>(recipe.components.map((c: { name: string }) => c.name.split("/")[1]));
  const unknown = new Set<string>();
  for (const file of walk(join(root, "implementation"))) {
    if (!/\.(ts|cjs)$/.test(file)) continue;
    for (const m of readFileSync(join(root, file), "utf8").matchAll(/components\/([a-z-]+)\//g)) if (!names.has(m[1])) unknown.add(`${file}: ${m[1]}`);
  }
  assert.deepEqual([...unknown], []);
});

// ---- wire fixtures and the configuration example ----

test("the wire fixtures parse and agree on the contract version", () => {
  for (const name of readdirSync(join(root, "tests/fixtures"))) {
    const view = json(`tests/fixtures/${name}`);
    assert.equal(view.contractVersion, 1, name);
    assert.ok(Array.isArray(view.players), name);
  }
});

test("the configuration example builds the three documents and refuses bad values", () => {
  const all = configurations();
  assert.equal(all.displayMode.eventName, defaults.modeEvent);
  assert.equal(all.videoCalls.roomPrefix, "ourpoker-");
  assert.equal(all.windowsDesktop.scheme, "ourpoker");
  assert.throws(() => windowsDesktopConfiguration({ ...defaults, scheme: "https" }));
  assert.throws(() => windowsDesktopConfiguration({ ...defaults, serverAddress: "http://rooms.example" }));
  assert.doesNotThrow(() => windowsDesktopConfiguration({ ...defaults, serverAddress: "http://localhost:8788" }));
});
