"""Application preparation and assertions through the installed native runner."""
import importlib.util
import json
import os
import plistlib
from pathlib import Path
import subprocess
import select
import shutil
import socket
import sys

APPLE_TEST_TARGETS = {
    'OurPokerTests': 'Unit test bundle',
    'OurPokerUITests': 'UI test bundle',
    'VideoComponentTests': 'Unit test bundle',
}

root = Path(__file__).resolve().parents[1]
shared = root / 'components/video-calls/verification/native.py'
sys.path.insert(0, str(shared.parent))
spec = importlib.util.spec_from_file_location('video_calls_native', shared)
native = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = native
spec.loader.exec_module(native)
context = native.read_context()
action = sys.argv[1]

if action == 'cleanup':
    native.write_cleanup_result(native.cleanup_native(context))
    raise SystemExit(0)

if action in ('apple-prepare', 'apple'):
    if context['settings'].get('applePlatform') != 'ios-simulator':
        raise ValueError('unsupported-application-runtime')
    options = dict(project=root / 'ios/OurPoker.xcodeproj', scheme='OurPoker',
                   derived_data=root / 'ios/build/runtime', package_cache=root / 'ios/build/packages')
    if action == 'apple-prepare':
        native.require(context, ['native-build', 'native-test', 'dependency-download', 'create-temporary-simulator'])
        developer = next(item['path'] for item in context['resources'] if item['id'] == 'appleDeveloperDirectory')
        environment = {**os.environ, 'DEVELOPER_DIR': developer}
        subprocess.run([sys.executable, str(root / 'scripts/generate-resources.py')], env=environment, check=True)
        subprocess.run([sys.executable, str(root / 'ios/prepare-project.py')], env=environment, check=True)
        (root / 'ios/build').mkdir(exist_ok=True)
        with socket.socket() as listener:
            listener.bind(('127.0.0.1', 0))
            port = listener.getsockname()[1]
        native.write_document(root / 'ios/build/test-server.json', {'runId': context['runId'], 'port': port})
        common = ['xcodebuild', '-quiet', '-project', options['project'], '-scheme', options['scheme'],
                  '-clonedSourcePackagesDirPath', options['package_cache'], '-packageCachePath', root / 'ios/build/package-cache', '-disablePackageRepositoryCache']
        native.run(context, [*common, '-resolvePackageDependencies', '-onlyUsePackageVersionsFromResolvedFile'], cwd=root / 'ios', timeout=300)
        native.run(context, [*common, '-derivedDataPath', options['derived_data'], '-destination', 'generic/platform=iOS Simulator',
                             '-disableAutomaticPackageResolution', '-onlyUsePackageVersionsFromResolvedFile', f'OURPOKER_TEST_SERVER_ADDRESS=http://127.0.0.1:{port}',
                             'CODE_SIGNING_ALLOWED=NO', 'build-for-testing'], cwd=root / 'ios', timeout=600)
        targets = set(APPLE_TEST_TARGETS)
        configured = set()
        for product in options['derived_data'].glob('Build/Products/*.xctestrun'):
            document = plistlib.loads(product.read_bytes())
            for name in targets.intersection(document):
                if document[name].get('EnvironmentVariables', {}).get('OURPOKER_TEST_SERVER_ADDRESS') != f'http://127.0.0.1:{port}':
                    raise ValueError('test-server-binding')
                configured.add(name)
        if configured != targets:
            raise ValueError('test-targets-missing')
        native.prepare_apple(context, **options)
        raise SystemExit(0)
    configuration = json.loads((root / 'ios/build/test-server.json').read_text())
    if configuration['runId'] != context['runId'] or type(configuration['port']) is not int or not 1 <= configuration['port'] <= 65535:
        raise ValueError('test-server-invalid')
    server = subprocess.Popen([str(Path(shutil.which('node')).resolve()), str(root / 'verification/native-server.mjs'), str(configuration['port'])],
                              stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, env=native.environment(context))
    try:
        if not select.select([server.stdout], [], [], 60)[0]:
            raise ValueError('test-server-unavailable')
        ready = json.loads(server.stdout.readline(4096))
        if ready != {'ready': True, 'port': configuration['port']}:
            raise ValueError('test-server-unavailable')
        result = native.run_apple(context, **options, expected_targets=dict(APPLE_TEST_TARGETS), test_settings={
            'OURPOKER_TEST_SERVER_ADDRESS': f"http://127.0.0.1:{configuration['port']}"
        })
    finally:
        server.stdin.close()
        try:
            server.wait(timeout=10)
        except subprocess.TimeoutExpired:
            server.terminate()
            try:
                server.wait(timeout=5)
            except subprocess.TimeoutExpired:
                server.kill()
                server.wait(timeout=5)
        server.stdout.close()
    if server.returncode != 0:
        result['cleanup'] = dict(required=True, attempted=True, completed=False, reason='cleanup-failed')
elif action in ('android', 'android-runtime', 'android-prepare', 'android-runtime-prepare'):
    native.require(context, ['native-build', 'native-test'])
    subprocess.run([sys.executable, str(root / 'scripts/generate-resources.py')], check=True)
    if action.endswith('-prepare'):
        tasks = ['assembleDebug', 'assembleDebugAndroidTest']
        if action == 'android-runtime-prepare':
            tasks.append('resolveConnectedTestPlatform')
        native.prepare_android(context, project=root / 'android', tasks=tasks)
        raise SystemExit(0)
    runtime = action == 'android-runtime'
    tasks = ['connectedDebugAndroidTest', '-Pandroid.testInstrumentationRunnerArguments.recipeVerification=true'] if runtime else ['testDebugUnitTest', 'assembleDebug', 'assembleDebugAndroidTest']
    artifacts = [root / 'android/app/build/outputs/apk/debug/app-debug.apk', root / 'android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk']
    result = native.run_android(context, project=root / 'android', tasks=tasks, artifact_paths=artifacts)
else:
    raise ValueError('unknown-check')

native.write_result(result)
raise SystemExit(0 if all(item['passed'] for item in result['assertions'] if item['id'] != 'process-tree-terminated') and result['cleanup']['reason'] != 'cleanup-failed' else 1)
