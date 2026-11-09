import assert from 'node:assert/strict';
import { prepareApplicationMedia } from './application-media.mjs';

const application = await prepareApplicationMedia();
try {
  assert.equal(new Set(Object.values(application.applicationClients.identities).map(value => value.id)).size, 3);
  assert.deepEqual(application.observations, { 'private-cards-hidden': false, 'participant-mapping': false });
  const clients = application.applicationClients;
  await clients.enterDisplay('publisher', clients.pages.publisher);
  await clients.observe('publisher', 'display', clients.pages.publisher);
  application.observations['private-cards-hidden'] = true;
  application.observations['participant-mapping'] = true;
  await assert.rejects(clients.observe('publisher', 'connected', clients.pages.subscriber));
  assert.deepEqual(application.observations, { 'private-cards-hidden': false, 'participant-mapping': false });
  console.log('Fixture: actual game display callback passed; missing frames and a wrong-page callback cannot establish provider assertions.');
} finally { await application.close(); }
