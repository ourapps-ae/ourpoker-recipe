import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readContext, requireOperations } from '../components/video-calls/verification/index.mjs';

const context = await readContext();
requireOperations(context, ['windows-execute']);
if (context.mode !== 'local' || process.platform !== 'win32' || process.arch !== 'x64' || context.settings.windowsArchitecture !== 'x64') throw new Error('host-unavailable');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const evidence = JSON.parse(await readFile(path.join(root, 'desktop/artifacts/package-evidence.json'), 'utf8'));
const executable = path.resolve(evidence.executable.file);
if (path.dirname(executable) !== path.join(root, 'desktop/artifacts/win-unpacked') || createHash('sha256').update(await readFile(executable)).digest('hex') !== evidence.executable.sha256) throw new Error('artifact-invalid');
const child = spawn(executable, ['--verify-application'], { stdio: 'inherit', windowsHide: false });
const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', resolve); });
process.exitCode = code === 0 ? 0 : 1;
