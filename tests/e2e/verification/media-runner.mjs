import { readContext, makeResult, writeResult, writeCleanupResult } from '../components/video-calls/verification/index.mjs';
import { verifyMedia } from '../components/video-calls/verification/index.mjs';
import { fileURLToPath } from 'node:url';
import { prepareApplicationMedia } from './application-media.mjs';

const context = await readContext();
process.env.PLAYWRIGHT_BROWSERS_PATH = fileURLToPath(new URL('../.verification-browser', import.meta.url));
const { createProviderDependencies, cleanupProvider } = await import('../components/video-calls/verification/index.mjs');
if (process.argv[2] === 'cleanup') {
  await writeCleanupResult(await cleanupProvider(context));
} else {
  let application;
  let result = makeResult(context);
  try {
    application = await prepareApplicationMedia();
    const dependencies = await createProviderDependencies(context, { applicationClients: application.applicationClients });
    result = await verifyMedia(context, dependencies);
    for (const id of ['private-cards-hidden', 'participant-mapping']) {
      const assertion = result.assertions.find(item => item.id === id);
      if (!assertion) throw new Error('assertion-set');
      assertion.passed = application.observations[id] === true;
      assertion.actual = assertion.passed;
    }
  } catch {
    for (const item of result.assertions) if (['private-cards-hidden', 'participant-mapping'].includes(item.id)) { item.passed = false; item.actual = false; }
  } finally {
    try { await application?.close(); }
    catch { result.cleanup = { required: true, attempted: true, completed: false, reason: 'cleanup-failed' }; }
    await writeResult(result);
  }
  process.exitCode = result.assertions.every(item => item.passed) && result.cleanup.reason !== 'cleanup-failed' ? 0 : 1;
}
