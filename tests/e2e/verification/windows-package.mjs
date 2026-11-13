import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readContext, requireOperations, makeResult, writeResult } from '../components/windows-desktop/desktop/index.cjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const context = await readContext();
requireOperations(context, ['windows-package']);
if (context.mode !== 'local') throw new Error('authorization-denied');
const child = spawn(process.execPath, ['scripts/package.cjs'], { cwd: path.join(root, 'desktop'), stdio: 'inherit' });
const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', resolve); });
const observations = {};
const artifacts = [];
if (code === 0) {
  const evidence = JSON.parse(await readFile(path.join(root, 'desktop/artifacts/package-evidence.json'), 'utf8'));
  const file = path.resolve(evidence.executable.file);
  if (!file.startsWith(path.join(root, 'desktop/artifacts') + path.sep)) throw new Error('artifact-path');
  const digest = createHash('sha256').update(await readFile(file)).digest('hex');
  observations['executable-architecture'] = evidence.executable.machine === 0x8664 && digest === evidence.executable.sha256;
  observations['entrypoint-present'] = evidence.scriptDigests['desktop/src/main.cjs'] !== undefined;
  observations['component-present'] = evidence.scriptDigests['components/windows-desktop/desktop/src/main.cjs'] !== undefined;
  observations['relocated-web'] = evidence.packagedResourcesVerified === true;
  observations['script-integrity'] = Object.keys(evidence.scriptDigests).length === 6;
  artifacts.push({ path: path.relative(root, file).split(path.sep).join('/'), digest, architecture: 'x64' });
}
const result = makeResult(context, observations);
result.artifacts = artifacts;
await writeResult(result);
process.exitCode = code === 0 && result.assertions.every(item => item.passed) ? 0 : 1;
