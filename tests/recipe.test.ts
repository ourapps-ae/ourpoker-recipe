// Consistency checks for recipe.json against the components in ../../components. Checks only; it assembles nothing.
// Run: node --test tests/recipe.test.ts
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import "../authoring/register-ts-js.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const componentsRoot = join(root, "..", "..", "components");
// The ourapps checkout whose catalogue validator is used: OURAPPS, else ../../ourapps beside the recipes folder.
const ourapps = process.env.OURAPPS ?? join(root, "..", "..", "ourapps");
const { validateRecipe, isSafeSvg } = await import(pathToFileURL(join(ourapps, "shared/src/catalogue.ts")).href);
const { checkCondition } = await import(pathToFileURL(join(ourapps, "shared/src/conditions.ts")).href);

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Obj = Record<string, any>;

const read = (path: string): any => JSON.parse(readFileSync(path, "utf8"));
const recipe: Obj = read(join(root, "recipe.json"));
const manifest = (slug: string): Obj => read(join(componentsRoot, slug, "component.json"));
const suitability = (slug: string): Obj => read(join(componentsRoot, slug, "suitability.json"));
const slugOf = (name: string): string => name.split("/")[1];

const GRAMMARS: Record<string, RegExp> = {
  identifier: /^[A-Za-z][A-Za-z0-9_]{0,63}$/,
  qualified: /^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/,
  slug: /^[a-z][a-z0-9-]{0,63}$/,
  label: /^[A-Za-z][A-Za-z0-9 -]{0,63}$/,
  environment: /^[A-Z][A-Z0-9_]{0,63}$/,
  address: /^https?:\/\/[A-Za-z0-9.-]+(:[0-9]{1,5})?(\/[A-Za-z0-9_/-]*)?$/,
};
const SECRET_REFERENCE = /^[A-Za-z][A-Za-z0-9_./-]{0,127}$/;
const LOAD_KEYS = ["concurrentPeople", "requestsPerDay", "storedMegabytes"];

const APPLICATION = "application";
const ownManifest: Obj = read(join(root, "component.json"));
const rules: Obj = read(join(root, "rules", "texas-holdem-house-rules.json"));
const componentDirectories = () => readdirSync(componentsRoot, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();

const byId = new Map<string, Obj>(recipe.components.map((c: Obj) => [c.id, c]));
const manifests = new Map<string, Obj>(recipe.components.map((c: Obj) => [c.id, manifest(slugOf(c.name))]));
const questions = new Map<string, Obj>(recipe.questions.map((q: Obj) => [q.id, q]));

// `application.<setting>` is a setting of the recipe's own component (component.json beside this file).
function settingOf(target: string): { component: Obj; setting: Obj } {
  const dot = target.indexOf(".");
  const id = target.slice(0, dot);
  const component = id === APPLICATION ? ownManifest : byId.get(id);
  assert.ok(component, `${target}: ${id} is not a component of the recipe`);
  const collect: Obj[] = id === APPLICATION ? ownManifest.collect : manifests.get(id)!.collect;
  const setting = collect.find((s: Obj) => s.id === target.slice(dot + 1));
  assert.ok(setting, `${target}: ${id} has no such setting (has ${collect.map((s: Obj) => s.id).join(", ")})`);
  return { component, setting };
}

// Returns a problem description, or null when the value is acceptable for the setting.
function misfit(setting: Obj, value: Json): string | null {
  if (setting.secret) return "a secret setting is set only by a {ref} effect of a secretRef question, never by a value";
  if (setting.type === "boolean") return typeof value === "boolean" ? null : "not a boolean";
  if (setting.type === "integer") return Number.isInteger(value) && Math.abs(value as number) < 2 ** 31 ? null : "not a 32-bit integer";
  if (typeof value !== "string") return "not text";
  if (!GRAMMARS[setting.grammar]) return `unknown grammar ${setting.grammar}`;
  return GRAMMARS[setting.grammar].test(value) ? null : `${JSON.stringify(value)} does not fit grammar ${setting.grammar}`;
}

function answerProblem(q: Obj, value: Json): string | null {
  switch (q.type) {
    case "boolean": return typeof value === "boolean" ? null : "not a boolean";
    case "integer": return Number.isInteger(value) && (q.min === undefined || (value as number) >= q.min) && (q.max === undefined || (value as number) <= q.max) ? null : `not an integer in ${q.min}..${q.max}`;
    case "choice": return q.options.includes(value) ? null : `${JSON.stringify(value)} is not one of ${q.options.join(", ")}`;
    case "set": return Array.isArray(value) && value.every((v) => q.options.includes(v)) ? null : `not a list drawn from ${q.options.join(", ")}`;
    case "text": return typeof value === "string" && value.length <= 500 ? null : "not text";
    case "secretRef": return typeof value === "string" && SECRET_REFERENCE.test(value) ? null : "not a secret reference name";
    default: return `unknown question type ${q.type}`;
  }
}


// What the validator is told about the components: settings from each component.json, profiles from each suitability.json.
function validatorContext(): { settings: Record<string, Obj[]>; profiles: Record<string, Obj[]> } {
  const settings: Record<string, Obj[]> = { [APPLICATION]: ownManifest.collect };
  const profiles: Record<string, Obj[]> = {};
  for (const c of recipe.components) {
    settings[c.name] = manifests.get(c.id)!.collect;
    profiles[c.name] = suitability(slugOf(c.name)).profiles;
  }
  return { settings, profiles };
}

const everyQuestionEffect = (): [Obj, string, any][] => recipe.questions.flatMap((q: Obj) => q.effects.flatMap((e: Obj) => Object.entries(e.sets ?? {}).map(([target, value]) => [q, target, value] as [Obj, string, any])));

test("recipe.json passes the ourapps catalogue validator, with the components' settings and profiles", () => {
  const result = validateRecipe(recipe, validatorContext());
  assert.ok(result.ok, result.ok ? "" : result.errors.join("\n"));
  assert.equal(recipe.name, "ourapps-ae/ourpoker");
  assert.equal(recipe.version, "0.4.0");
  assert.equal(recipe.components.length, 39);
  assert.equal(recipe.questions.length, 25);
});

test("page, instructions and diagram files exist; the diagrams are safe SVG", () => {
  for (const path of [recipe.page.description, recipe.page.diagram, recipe.instructions]) assert.ok(existsSync(join(root, path)), `${path} is missing`);
  // isSafeSvg also refuses an image over 200000 characters: the whole-design drawing is over it (SVG only, never published as the page diagram).
  const tooLarge = ["diagram-full.svg"];
  for (const name of readdirSync(join(root, "page")).filter((f) => f.endsWith(".svg"))) {
    const svg = readFileSync(join(root, "page", name), "utf8");
    if (tooLarge.includes(name)) assert.ok(svg.length > 200000 && !/<!DOCTYPE|<script|javascript:/i.test(svg), `page/${name}`);
    else assert.ok(isSafeSvg(svg), `page/${name} is not accepted by isSafeSvg`);
  }
  assert.ok(existsSync(join(root, "page", "diagram.png")), "page/diagram.png is missing");
});

test("every component exists in components/ at the version named, and all 39 directories are used", () => {
  const directories = componentDirectories();
  assert.deepEqual(recipe.components.map((c: Obj) => slugOf(c.name)).sort(), directories);
  for (const c of recipe.components) {
    const m = manifests.get(c.id)!;
    assert.equal(m.identity.name, c.name, `${c.id} name`);
    assert.equal(m.identity.version.join ? m.identity.version.join(".") : m.identity.version, c.version, `${c.id} version`);
    assert.equal(c.id, slugOf(c.name), `${c.id}: the instance id is the component's short name`);
    assert.notEqual(c.id, APPLICATION);
  }
});

test("the decided format: no includes, no $job, no null, no mapEach, no secret in configuration", () => {
  const text = readFileSync(join(root, "recipe.json"), "utf8");
  assert.ok(!/"includes"|\$job|mapEach|"secretRef":/.test(text), "a removed form is still in recipe.json");
  const nulls = JSON.stringify(recipe, (key, value) => (key === "includedWhen" ? undefined : value));
  assert.ok(!/:null\b|\[null|,null/.test(nulls), "null outside includedWhen");
  for (const c of recipe.components) for (const id of Object.keys(c.configuration as Obj)) assert.ok(!settingOf(`${c.id}.${id}`).setting.secret, `${c.id}.${id} is secret and set in configuration`);
  assert.ok(!recipe.components.some((c: Obj) => c.id === APPLICATION));
});

test("configuration values name real settings and fit type and grammar", () => {
  let checked = 0;
  for (const c of recipe.components) {
    for (const [id, value] of Object.entries(c.configuration as Obj)) {
      const { setting } = settingOf(`${c.id}.${id}`);
      const problem = misfit(setting, value as Json);
      assert.equal(problem, null, `${c.id}.${id}: ${problem}`);
      checked += 1;
    }
  }
  assert.ok(checked > 40);
});

test("every required setting without a default is given by configuration or by some question", () => {
  const setBy = new Set<string>();
  for (const [, target] of everyQuestionEffect()) setBy.add(target);
  const missing: string[] = [];
  for (const c of recipe.components) {
    for (const s of manifests.get(c.id)!.collect) {
      if (s.required && s.default === undefined && !(s.id in c.configuration) && !setBy.has(`${c.id}.${s.id}`)) missing.push(`${c.id}.${s.id}`);
    }
  }
  assert.deepEqual(missing, ["server-host.provider"], "the provider is the one required setting written by selection (rule 7), not by configuration or a question; web-host.webAddress comes from the webAddress question");
});

test("every question `sets` target is a real setting and its value form fits the setting's type", () => {
  let checked = 0;
  const forms = new Set<string>();
  for (const [q, target, value] of everyQuestionEffect()) {
    const { setting } = settingOf(target);
    const where = `${q.id} -> ${target}`;
    checked += 1;
    if (value === "$answer") {
      forms.add("$answer");
      assert.ok(!setting.secret, `${where}: a secret setting is set by {ref}`);
      if (q.type === "integer") assert.equal(setting.type, "integer", where);
      else if (q.type === "boolean") assert.equal(setting.type, "boolean", where);
      else if (q.type === "choice") for (const option of q.options) assert.equal(misfit(setting, option), null, `${where}: option ${option}`);
      else if (q.type === "set") assert.equal(misfit(setting, q.options.join(" ")), null, `${where}: the options joined by spaces`);
      else if (q.type === "text") assert.equal(setting.type, "string", where);
      else assert.fail(`${where}: question type ${q.type} cannot be passed as $answer`);
    } else if (typeof value === "object" && value !== null) {
      const [form] = Object.keys(value);
      forms.add(form);
      assert.equal(Object.keys(value).length, 1, where);
      if (form === "map") {
        assert.equal(q.type, "choice", where);
        assert.deepEqual(Object.keys(value.map).sort(), [...q.options].sort(), `${where}: the map covers every option`);
        for (const [key, mapped] of Object.entries(value.map)) assert.equal(misfit(setting, mapped as Json), null, `${where}: ${key}`);
      } else if (form === "ref") {
        const target = questions.get(value.ref);
        assert.ok(target && target.type === "secretRef", `${where}: ref names a secretRef question`);
        assert.equal(setting.type, "string", where);
      } else assert.fail(`${where}: form ${form} is not used by this recipe`);
    } else {
      forms.add("literal");
      assert.equal(misfit(setting, value as Json), null, where);
    }
  }
  assert.ok(checked >= 40);
  assert.deepEqual([...forms].sort(), ["$answer", "map", "ref"]);
});

test("secret references come only from secretRef questions guarded by askWhen, each set by a {ref} effect", () => {
  const secretSettings = new Map<string, string>();
  for (const c of recipe.components) for (const s of manifests.get(c.id)!.collect) if (s.secret) secretSettings.set(`${c.id}.${s.id}`, s.id);
  const refs = recipe.questions.filter((q: Obj) => q.type === "secretRef");
  assert.deepEqual(refs.map((q: Obj) => q.id), ["videoKey", "videoSecret", "hostingAccount", "storeCredentials", "androidSigning", "webDeploy"]);
  for (const q of refs) {
    assert.equal(q.default, undefined, `${q.id}: a secretRef question has no default`);
    assert.equal(q.effects.length, 1);
    for (const [target, value] of Object.entries(q.effects[0].sets as Obj)) assert.deepEqual(value, { ref: q.id }, `${q.id} -> ${target}`);
    // a setting that is secret and optional may stay unset when the question is not asked; a required secret needs a question that is always asked
    for (const target of Object.keys(q.effects[0].sets as Obj)) {
      const { setting } = settingOf(target);
      if (setting.required) assert.equal(q.askWhen, undefined, `${target} is required, so ${q.id} must always be asked`);
    }
  }
  const askedWhen = (id: string) => questions.get(id)!.askWhen;
  assert.equal(askedWhen("videoKey"), "video");
  assert.equal(askedWhen("videoSecret"), "video");
  assert.equal(askedWhen("hostingAccount"), "server == 'cloudflare'");
  assert.equal(askedWhen("storeCredentials"), "updates || 'ios' in targets");
  assert.equal(manifests.get("ourapps-release")!.collect.find((s: Obj) => s.id === "storeCredentials").required, false);
  const storeSets = everyQuestionEffect().filter(([, target]) => target === "ourapps-release.storeCredentials");
  assert.equal(storeSets.length, 1, "storeCredentials is set once, only by the {ref} effect");
  assert.deepEqual(storeSets[0][2], { ref: "storeCredentials" });
  assert.ok(!("storeCredentials" in byId.get("ourapps-release")!.configuration), "never in configuration");
  for (const secret of secretSettings.keys()) assert.ok(everyQuestionEffect().some(([, target, value]) => target === secret && value.ref), `${secret} has no {ref} effect`);
});

test("inclusion is by includedWhen only, with the decided conditions", () => {
  const when = (id: string) => byId.get(id)!.includedWhen;
  assert.equal(when("web-host"), "'web' in targets || 'windows' in targets", "the Windows build packs the web client");
  assert.equal(when("apple-host"), "'ios' in targets || 'macos' in targets || 'tvos' in targets");
  assert.equal(when("android-host"), "'android' in targets");
  assert.equal(when("windows-desktop"), "'windows' in targets");
  assert.equal(when("video-calls"), "video");
  assert.equal(when("guided-tour"), "lessons");
  assert.equal(when("store-update"), "updates");
  const computersOut = "computerPlayers != 'none'";
  assert.ok(manifests.get("turn-engine")!.requires.some((p: Obj) => p.type === "ae/computer-players" && p.optional === true), "turn-engine's computer-players requirement is optional");
  assert.equal(when("computer-players"), computersOut);
  assert.equal(when("poker-strategy"), computersOut);
  const conditional = recipe.components.filter((c: Obj) => c.includedWhen).map((c: Obj) => c.id).sort();
  assert.deepEqual(conditional, ["android-host", "apple-host", "guided-tour", "store-update", "video-calls", "web-host", "windows-desktop", "computer-players", "poker-strategy"].sort());
  assert.deepEqual(questions.get("targets")!.effects[0].sets["apple-host.targets"], "$answer", "the devices answer reaches apple-host whole");
  // every condition is a CEL string that type-checks to bool over the questions, comparing only with options of the question
  const conditions = [...recipe.components.map((c: Obj) => [c.id, c.includedWhen]), ...recipe.questions.map((q: Obj) => [q.id, q.askWhen])].filter(([, w]) => w !== null && w !== undefined);
  assert.equal(conditions.length, 18);
  for (const [owner, condition] of conditions) {
    assert.equal(typeof condition, "string", `${owner}: a condition is a CEL string`);
    const checked = checkCondition(condition, questions);
    assert.ok(checked.ok, `${owner}: ${condition}: ${checked.ok ? "" : checked.error}`);
  }
  for (const q of recipe.questions) for (const e of q.effects) assert.ok(!("includes" in e), `${q.id}: effects have no includes`);
});

test("connections use real port ids and types, join identical type and version, connect the application, and leave only optional requirements open", () => {
  const all = new Map<string, Obj>([...manifests, [APPLICATION, ownManifest]]);
  const connected = new Set<string>();
  for (const c of recipe.connections) {
    const out = all.get(c.source.instance)!.provides.find((p: Obj) => p.id === c.source.port);
    const into = all.get(c.target.instance)!.requires.find((p: Obj) => p.id === c.target.port);
    assert.ok(out, `${c.source.instance} provides no port ${c.source.port}`);
    assert.ok(into, `${c.target.instance} requires no port ${c.target.port}`);
    assert.equal(out.type, into.type, `${c.source.instance}.${c.source.port} -> ${c.target.instance}.${c.target.port} type`);
    assert.equal(out.version, into.version, `${c.source.instance}.${c.source.port} -> ${c.target.instance}.${c.target.port} version`);
    const key = `${c.target.instance}.${c.target.port}`;
    assert.ok(!connected.has(key), `${key} is connected twice`);
    connected.add(key);
  }
  const open: string[] = [];
  for (const [id, m] of all) for (const p of m.requires) if (!connected.has(`${id}.${p.id}`)) open.push(`${id}.${p.id}:${p.optional === true}`);
  assert.deepEqual(open.sort(), ["display-mode.configuration:true", "video-calls.configuration:true", "windows-desktop.configuration:true"]);
  const has = (s: string, sp: string, t: string, tp: string) => recipe.connections.some((c: Obj) => c.source.instance === s && c.source.port === sp && c.target.instance === t && c.target.port === tp);
  assert.ok(has("guest-identity", "guest-identity", "realtime-rooms", "guest-identity"), "realtime-rooms takes identity from guest-identity");
  assert.ok(has(APPLICATION, "poker-game-adapter", "realtime-rooms", "game"), "the clients read the application's poker view");
  assert.ok(has("turn-engine", "game-adapter", APPLICATION, "game-adapter"));
  assert.equal(recipe.connections.filter((c: Obj) => c.target.instance === APPLICATION).length, ownManifest.requires.length);
});

test("the application's requirement is optional exactly when its provider has an includedWhen; it provides no configuration port", () => {
  const providerOf = new Map<string, string>(recipe.connections.filter((c: Obj) => c.target.instance === APPLICATION).map((c: Obj) => [c.target.port, c.source.instance]));
  for (const p of ownManifest.requires) {
    const provider = byId.get(providerOf.get(p.id)!)!;
    assert.equal(p.optional === true, provider.includedWhen !== null, `application.${p.id} (${provider.id})`);
  }
  assert.deepEqual(ownManifest.provides.map((p: Obj) => p.id), ["poker-game-adapter"]);
  const visual = read(join(root, "visual", "definition.json"));
  for (const p of ownManifest.requires) assert.equal(visual.ports.find((v: Obj) => v.id === p.id).required, p.optional !== true, p.id);
});

test("every job candidate names a component of the recipe and a profile in its suitability file", () => {
  for (const job of recipe.jobs) {
    for (const candidate of job.candidates) {
      const slug = slugOf(candidate.component);
      assert.ok(byId.has(slug), `${candidate.component} is not in the recipe`);
      const profiles = suitability(slug).profiles.map((p: Obj) => p.id);
      assert.ok(profiles.includes(candidate.profile), `${job.id}: ${slug} has no profile ${candidate.profile} (has ${profiles.join(", ")})`);
    }
    if (job.overrideQuestion) assert.equal(questions.get(job.overrideQuestion)!.type, "choice");
  }
  assert.deepEqual(recipe.jobs.map((j: Obj) => j.id), ["server", "realtime", "video"]);
  assert.deepEqual(recipe.jobs.map((j: Obj) => j.overrideQuestion ?? null), ["server", "server", null]);
  assert.ok(!everyQuestionEffect().some(([, target]) => target === "server-host.provider"), "the provider is written by selection, not by a question");
});

test("scale bands match the scale question and use the suitability load keys, rising band by band", () => {
  assert.equal(recipe.scale.question, "scale");
  assert.deepEqual(recipe.scale.bands.map((b: Obj) => b.id), questions.get("scale")!.options);
  assert.deepEqual(recipe.scale.bands.map((b: Obj) => b.id), ["small", "medium", "large"]);
  let previous: Obj = {};
  for (const band of recipe.scale.bands) {
    assert.deepEqual(Object.keys(band.load).sort(), LOAD_KEYS);
    for (const key of LOAD_KEYS) assert.ok(band.load[key] > (previous[key] ?? 0), `${band.id}.${key} rises`);
    previous = band.load;
  }
  const used = new Set<string>();
  for (const slug of componentDirectories()) for (const p of suitability(slug).profiles) for (const key of Object.keys(p.load)) used.add(key);
  for (const key of used) assert.ok(LOAD_KEYS.includes(key), `suitability load key ${key} is not in the scale bands`);
});

test("each scale band is covered by at least one candidate of every job, and the small band by a free one", () => {
  const covers = (profile: Obj, load: Obj) => Object.entries(load).every(([key, need]) => profile.load[key] === undefined || profile.load[key] >= (need as number));
  for (const band of recipe.scale.bands) {
    for (const job of recipe.jobs) {
      const profiles = job.candidates.map((c: Obj) => suitability(slugOf(c.component)).profiles.find((p: Obj) => p.id === c.profile));
      const fits = profiles.filter((p: Obj) => covers(p, band.load));
      assert.ok(fits.length > 0, `band ${band.id}: no candidate of job ${job.id} covers ${JSON.stringify(band.load)}`);
      if (band.id === "small") assert.ok(fits.some((p: Obj) => p.cost === "free" || p.cost === "none"), `job ${job.id}: no free candidate for small`);
    }
  }
});

test("default answers and every answer set give allowed answers, and every asked question has an answer or a default", () => {
  const sets = [{ id: "default", answers: recipe.tests.defaultAnswers }, ...recipe.tests.answerSets];
  for (const set of sets) {
    for (const [id, value] of Object.entries(set.answers as Obj)) {
      const q = questions.get(id);
      assert.ok(q, `${set.id}: ${id} is not a question`);
      assert.equal(answerProblem(q, value as Json), null, `${set.id}.${id}`);
    }
    for (const q of recipe.questions) {
      if (q.askWhen || q.default !== undefined) continue;
      assert.ok(q.id in set.answers, `${set.id}: no answer for ${q.id}`);
    }
  }
  for (const q of recipe.questions) if (q.default !== undefined) assert.equal(answerProblem(q, q.default), null, `default of ${q.id}`);
  const ids = recipe.tests.answerSets.map((s: Obj) => s.id);
  for (const needed of ["book-club", "poker-league", "company-event", "company-event-hosted", "tv-only", "browser-only-no-extras", "large-paid-host", "clinic", "no-computers"]) assert.ok(ids.includes(needed), `answer set ${needed}`);
  const bookClub = recipe.tests.answerSets.find((s: Obj) => s.id === "book-club").answers;
  assert.deepEqual([bookClub.targets, bookClub.languages, bookClub.video, bookClub.startingChips, bookClub.scale], [["ios", "android", "tvos"], ["en", "fr"], false, 3000, "small"]);
});

test("default answers carry the house rules file's numbers, and every answer that changes a rule also sets the application's copy", () => {
  const d = recipe.tests.defaultAnswers;
  assert.deepEqual([d.players, d.startingChips, d.levelSeconds, d.decisionSeconds, d.rebuys], [rules.players.maximum, rules.chips.starting_stack, rules.blinds.level_duration_seconds, rules.timing.decision_seconds, rules.rebuy.maximum_per_player]);
  assert.equal(rules.rebuy.stack_awarded, rules.chips.starting_stack);
  const applicationSets = new Map<string, string>();
  for (const [q, target, value] of everyQuestionEffect()) if (target.startsWith(`${APPLICATION}.`)) applicationSets.set(target.slice(APPLICATION.length + 1), `${q.id}:${JSON.stringify(value)}`);
  const expected: Record<string, string> = { maximumPlayers: "players", startingStack: "startingChips", levelSeconds: "levelSeconds", rebuysPerPlayer: "rebuys", decisionSeconds: "decisionSeconds", computerPlayers: "computerPlayers", updatesEnabled: "updates" };
  for (const [setting, question] of Object.entries(expected)) assert.equal(applicationSets.get(setting), `${question}:"$answer"`, `application.${setting} is set from ${question}`);
  const defaultOf = (id: string) => ownManifest.collect.find((s: Obj) => s.id === id).default;
  assert.deepEqual([defaultOf("maximumPlayers"), defaultOf("startingStack"), defaultOf("levelSeconds"), defaultOf("rebuysPerPlayer"), defaultOf("decisionSeconds")], [d.players, d.startingChips, d.levelSeconds, d.rebuys, d.decisionSeconds]);
  assert.equal(defaultOf("computerPlayers"), d.computerPlayers);
  assert.equal(defaultOf("computerPlayers"), questions.get("computerPlayers")!.default);
  assert.equal(defaultOf("roomPrefix"), byId.get("server-host")!.configuration.roomPrefix, "the application's room prefix and the server host's are one value");
  assert.equal(defaultOf("packageId"), byId.get("apple-host")!.configuration.bundleIdentifier, "the derived bundle identifier is one value");
  assert.equal(defaultOf("packageId"), `app.ourapps.${defaultOf("applicationId")}`);
});

test("the recipe does not restate a number the house rules file states", () => {
  const restated: [string, string, unknown][] = [
    ["seating", "minimumPlayers", rules.players.minimum], ["seating", "seating", rules.players.seating], ["seating", "returnToStack", rules.players.return_to_existing_stack_allowed],
    ["chip-ledger", "startingStack", rules.chips.starting_stack], ["chip-ledger", "minimumUnit", rules.chips.minimum_unit], ["chip-ledger", "sidePots", rules.betting.side_pots],
    ["chip-ledger", "oddChipRule", rules.pots.odd_chips], ["level-schedule", "afterLastLevel", "double"], ["level-schedule", "multiplier", rules.blinds.after_last_level.big_blind_multiplier_each_level],
    ["tournament", "lastRebuyLevel", rules.rebuy.eligibility.maximum_level], ["tournament", "rebuyDecisionSeconds", rules.rebuy.decision_seconds],
    ["holdem-rules", "minimumOpeningBetBigBlinds", rules.betting.minimum_opening_bet_big_blinds], ["game-clock", "onTimeout", rules.timing.timeout],
  ];
  for (const [id, setting] of restated.map(([a, b]) => [a, b])) assert.ok(!(setting in byId.get(id)!.configuration), `${id}.${setting} is in the rules file; the recipe must not set it again`);
  const setByQuestion = new Set<string>(everyQuestionEffect().map(([, target]) => target));
  assert.ok(!setByQuestion.has("chip-ledger.startingStack"), "only the tournament's startingStack is set from the chips answer");
  assert.ok(setByQuestion.has("tournament.startingStack"));
  assert.ok(setByQuestion.has("chip-ledger.seats"), "the ledger's seats come from the players answer");
  assert.equal(questions.get("players")!.effects[0].sets["chip-ledger.seats"], "$answer");
  assert.equal(byId.get("rules-settings")!.configuration.rulesFile, "texas-holdem-house-rules");
  assert.ok(existsSync(join(root, "rules", `${byId.get("rules-settings")!.configuration.rulesFile}.json`)), "the named rules file is in rules/");
  assert.ok(existsSync(join(root, "rules", `${byId.get("rules-settings")!.configuration.rulesFile}.schema.json`)));
  assert.ok(!("nameMinLength" in byId.get("guest-identity")!.configuration), "guest-identity keeps its defaults, which the application uses too");
});

test("addresses: no address setting in configuration; the web address and the follow-up addresses come from questions", () => {
  for (const c of recipe.components) for (const [id, value] of Object.entries(c.configuration as Obj)) if (settingOf(`${c.id}.${id}`).setting.grammar === "address") assert.fail(`${c.id}.${id} is an address (${value}); addresses come from questions`);
  const web = questions.get("webAddress")!;
  assert.equal(web.type, "text");
  assert.equal(web.default, "http://localhost:5173");
  assert.equal(web.askWhen, "'web' in targets");
  assert.equal(web.effects[0].sets["web-host.webAddress"], "$answer", "web-host.webAddress is never missing");
  // server-host refuses an allowed origin that is plain http and not localhost, so every answer set's web address is https or localhost
  for (const set of [{ id: "default", answers: recipe.tests.defaultAnswers }, ...recipe.tests.answerSets]) {
    const address = set.answers.webAddress ?? web.default;
    assert.match(address, /^(https:\/\/|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$)/, `${set.id}: webAddress ${address}`);
  }
  const video = questions.get("videoServiceUrl")!;
  assert.deepEqual([video.type, video.default, video.askWhen, video.effects[0].sets["video-calls.serviceUrl"]], ["text", "", "video", "$answer"]);
  const invite = questions.get("storeInvitation")!;
  assert.deepEqual([invite.type, invite.default, invite.askWhen, invite.effects[0].sets["store-update.inviteAddress"]], ["text", "", "updates", "$answer"]);
  const server = questions.get("serverAddress")!;
  assert.deepEqual([server.type, server.default, server.askWhen ?? null, server.effects[0].sets["application.serverAddress"]], ["text", "http://localhost:8788", null, "$answer"]);
  const bundle = questions.get("bundleId")!;
  assert.deepEqual([bundle.type, bundle.default, bundle.askWhen ?? null], ["text", "", null]);
  assert.deepEqual(Object.keys(bundle.effects[0].sets).sort(), ["android-host.packageId", "apple-host.bundleIdentifier", "application.packageId", "ourapps-release.bundleIdentifier"]);
  const text = readFileSync(join(root, "recipe.json"), "utf8");
  assert.ok(!/example\.(com|org)|127\.0\.0\.1/.test(text), "placeholder address in recipe.json");
});

test("computer players are a choice mapped to the component's mode; video and updates are included by their answers", () => {
  const q = questions.get("computerPlayers")!;
  assert.deepEqual([q.type, q.options, q.default], ["choice", ["none", "on-request", "fill-empty"], "on-request"]);
  assert.equal(q.effects[0].sets["computer-players.mode"], "$answer");
  const all = everyQuestionEffect().map(([, target]) => target);
  for (const gone of ["computer-players.enabled", "computer-players.fillEmptySeats", "computer-players.takeOverAbsent", "video-calls.enabled", "store-update.enabled"]) assert.ok(!all.includes(gone), `${gone} is not set`);
  assert.equal(byId.get("computer-players")!.configuration.names, "Robin Sam Alex Jordan Casey Morgan Taylor Riley");
  assert.equal(manifests.get("computer-players")!.collect.find((s: Obj) => s.id === "mode").default, "on-request");
});

test("the questions of paper Section 5.4 are present, in order, with the follow-up questions guarded by askWhen", () => {
  const ids = recipe.questions.map((q: Obj) => q.id);
  const paper = ["targets", "scale", "languages", "look", "players", "startingChips", "levelSeconds", "rebuys", "decisionSeconds", "computerPlayers", "video", "lessons", "server", "updates"];
  assert.deepEqual(ids.filter((id: string) => paper.includes(id)), paper);
  const followUps = ids.filter((id: string) => !paper.includes(id));
  assert.deepEqual(followUps, ["webAddress", "bundleId", "videoServiceUrl", "videoKey", "videoSecret", "hostingAccount", "serverAddress", "storeInvitation", "storeCredentials", "androidSigning", "webDeploy"]);
  for (const id of followUps) if (!["bundleId", "serverAddress", "storeCredentials"].includes(id)) assert.ok(questions.get(id)!.askWhen, `${id} has askWhen`);
  for (const q of recipe.questions) {
    assert.ok(q.ask && q.askAgent, `${q.id} has wording for people and for the agent`);
    if (q.askWhen) assert.ok(q.type === "secretRef" || (q.default !== undefined && q.default !== null), `${q.id}: a question with askWhen has a default`);
  }
});

test("artefact `component` marks name only components the recipe can leave out", () => {
  const optional = new Set(recipe.components.filter((c: Obj) => c.includedWhen).map((c: Obj) => c.name));
  const marked = ownManifest.artefacts.filter((a: Obj) => "component" in a);
  assert.ok(marked.length > 0);
  for (const a of marked) assert.ok(optional.has(a.component), `${a.source}: ${a.component} is not conditional`);
});

test("INTEGRATION-GAPS.md lists only open and deferred items, and its totals match its table", () => {
  const text = readFileSync(join(root, "INTEGRATION-GAPS.md"), "utf8");
  assert.ok(text.startsWith("# OurPoker integration status"));
  const rows = text.split("\n").filter((line) => /^\| G\d+\.\d+ \|/.test(line));
  const SEVERITIES = ["blocks assembly", "needs adapter", "cosmetic"];
  const STATUSES = ["deferred", "open"];
  const status: Record<string, number> = { deferred: 0, open: 0 };
  const severity: Record<string, number> = { "blocks assembly": 0, "needs adapter": 0, cosmetic: 0 };
  const ids = new Set<string>();
  for (const row of rows) {
    const cells = row.split(/(?<!\\)\|/).map((c) => c.trim());
    assert.equal(cells.length, 10, `row has 8 columns: ${row.slice(0, 80)}`);
    const [id, sev, state, remains, owner] = [cells[1], cells[5], cells[6], cells[7], cells[8]];
    assert.ok(SEVERITIES.includes(sev), `${id}: unknown severity ${sev}`);
    assert.ok(STATUSES.includes(state), `${id}: status ${state} is not open or deferred`);
    assert.ok(!ids.has(id), `${id} is used twice`);
    ids.add(id);
    assert.ok(remains.length > 0 && owner.length > 0, `${id}: what remains and the component to change are filled`);
    severity[sev] += 1;
    status[state] += 1;
  }
  const total = text.match(/Total (\d+) open items: open (\d+), deferred (\d+)\./);
  assert.ok(total, "the Total line is present");
  assert.deepEqual([rows.length, status.open, status.deferred], total.slice(1).map(Number));
  const bySeverity = text.match(/blocks assembly (\d+), needs adapter (\d+), cosmetic (\d+)\./);
  assert.ok(bySeverity, "the severity line is present");
  assert.deepEqual([severity["blocks assembly"], severity["needs adapter"], severity.cosmetic], bySeverity.slice(1).map(Number));
  for (const heading of ["## Open items", "## Decisions", "## What is not specified or built"]) assert.ok(text.includes(heading), heading);
  assert.match(text, /Nothing here runs a recipe/);
});

test("the recipe's documents state what is: no history and no compatibility wording", () => {
  const documents = ["AGENTS.md", "CONTRACT.md", "SOURCE.md", "INTEGRATION-GAPS.md", "REVIEW.md", "INSTRUCTIONS.md", "page/description.md", ".opencode/knowledge/00-index.md", ".opencode/knowledge/workflow.md"];
  const banned = /backward|compatib|legacy|no longer|no more|formerly|previously|unchanged|retained|still works|closed by|since \d|first version|\bolder |not sent any more/i;
  for (const file of documents) {
    const text = readFileSync(join(root, file), "utf8");
    for (const [index, line] of text.split("\n").entries()) assert.ok(!banned.test(line), `${file}:${index + 1}: ${line.slice(0, 100)}`);
  }
});
