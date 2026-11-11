const { build, Platform, Arch } = require('electron-builder');
const path = require('node:path');
const fs = require('node:fs/promises');
const { createHash } = require('node:crypto');

async function inspect(file) {
  const bytes = await fs.readFile(file);
  if (bytes.readUInt16LE(0) !== 0x5a4d) throw new Error(`Not a Windows executable: ${file}`);
  const header = bytes.readUInt32LE(0x3c);
  if (bytes.readUInt32LE(header) !== 0x4550) throw new Error(`Invalid executable header: ${file}`);
  const optional = header + 24;
  const format = bytes.readUInt16LE(optional);
  if (format !== 0x10b && format !== 0x20b) throw new Error('Unknown executable format');
  const certificate = optional + (format === 0x20b ? 112 : 96) + 4 * 8;
  const certificateBytes = bytes.readUInt32LE(certificate + 4);
  if (certificateBytes !== 0) throw new Error(`Expected unsigned executable: ${file}`);
  return { file, machine: bytes.readUInt16LE(header + 4), certificateBytes,
    bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
}

function config(version) {
  return {
    appId: '{{packageId}}', productName: '{{applicationName}}',
    electronVersion: require('../package.json').devDependencies.electron,
    directories: { output: 'artifacts', app: 'build/package-app' },
    files: ['desktop/src/**/*.cjs', 'components/**/*.cjs', 'components/**/*.mjs', 'package.json'],
    extraResources: [{ from: path.resolve(__dirname, '../build/web'), to: 'web' }],
    extraMetadata: { version, main: 'desktop/src/main.cjs' }, asar: true, npmRebuild: false, publish: null,
    artifactName: '{{applicationId}}-${version}-windows-${arch}-unsigned.${ext}',
    win: { target: [{ target: 'nsis', arch: ['x64'] }], signAndEditExecutable: false, signExecutable: false },
    nsis: { oneClick: false, perMachine: false, allowToChangeInstallationDirectory: true, runAfterFinish: false,
      },
  };
}

async function pack() {
  const version = process.env.APP_VERSION || require('../package.json').version;
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) throw new Error('Invalid APP_VERSION');
  process.env.CSC_IDENTITY_AUTO_DISCOVERY = 'false';
  const root = path.resolve(__dirname, '..');
  const sources = [
    ['desktop/src/main.cjs', 'src/main.cjs'], ['desktop/src/verify.cjs', 'src/verify.cjs'],
    ...['main', 'shell', 'policy'].map(name => [`components/windows-desktop/desktop/src/${name}.cjs`, `../components/windows-desktop/desktop/src/${name}.cjs`]),
    ['components/windows-desktop/verification/result.mjs', '../components/windows-desktop/verification/result.mjs'],
  ];
  const stage = path.join(root, 'build/package-app');
  await fs.rm(stage, { recursive: true, force: true });
  await fs.mkdir(stage, { recursive: true });
  await fs.copyFile(path.join(root, 'package.json'), path.join(stage, 'package.json'));
  for (const [entry, source] of sources) {
    const target = path.join(stage, entry);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(path.join(root, source), target);
  }
  const products = await build({
    projectDir: root, targets: Platform.WINDOWS.createTarget('nsis', Arch.x64), publish: 'never', config: config(version),
  });
  const executable = await inspect(path.join(root, 'artifacts/win-unpacked/{{applicationName}}.exe'));
  const asar = await import('@electron/asar');
  const resources = path.join(root, 'artifacts/win-unpacked/resources');
  const archive = path.join(resources, 'app.asar');
  const packaged = JSON.parse(asar.extractFile(archive, 'package.json').toString());
  if (packaged.main !== 'desktop/src/main.cjs') throw new Error('Invalid packaged entrypoint');
  asar.extractFile(archive, packaged.main);
  asar.extractFile(archive, 'desktop/src/verify.cjs');
  asar.extractFile(archive, 'components/windows-desktop/verification/result.mjs');
  const scriptDigests = {};
  for (const [entry, source] of sources) {
    const expected = await fs.readFile(path.join(root, source));
    if (!expected.equals(asar.extractFile(archive, entry))) throw new Error('Packaged script mismatch');
    scriptDigests[entry] = createHash('sha256').update(expected).digest('hex');
  }
  const module = { exports: {} };
  new Function('require', 'module', 'exports', asar.extractFile(archive, 'components/windows-desktop/desktop/src/policy.cjs').toString())(require, module, module.exports);
  const policy = module.exports.createPolicy({ scheme: '{{scheme}}', serverOrigin: '{{serverAddress}}', externalOrigins: [] });
  const response = await policy.assetResponse(path.join(resources, 'web'), new Request(policy.ENTRY));
  if (response.status !== 200) throw new Error('Packaged web resources unavailable');
  const html = await response.text();
  for (const [, asset] of html.matchAll(/(?:src|href)="\.\/(assets\/[^"?]+)"/g)) {
    if (!await policy.assetPath(path.join(resources, 'web'), `${policy.ORIGIN}/${asset}`)) throw new Error('Packaged asset missing');
  }
  if (executable.machine !== 0x8664) throw new Error('Packaged application must be x86_64');
  const installers = await Promise.all(products.filter((file) => file.endsWith('.exe')).map(inspect));
  if (installers.length !== 1) throw new Error('Expected one Windows installer');
  await fs.writeFile(path.join(root, 'artifacts/package-evidence.json'), JSON.stringify({
    version, architecture: 'x64', platform: 'win32', minimumWindows: '10', signed: false,
    electron: require('../package.json').devDependencies.electron, products, executable, installers,
    packagedResourcesVerified: true, scriptDigests, nativeWindowsRuntimeVerified: false,
  }, null, 2) + '\n');
  console.log('Unsigned Windows package built; native installation and runtime remain unverified.');
}
if (require.main === module) pack().catch((error) => { console.error(error); process.exitCode = 1; });
module.exports = { config };
