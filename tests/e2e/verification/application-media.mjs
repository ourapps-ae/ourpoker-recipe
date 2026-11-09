import assert from 'node:assert/strict';
import { startHand, startLocalApplication } from '../web/test/local-application.mjs';
import { assertPrivateCards, assertParticipantMapping, assertPublicRendering } from './application-assertions.mjs';

export async function prepareApplicationMedia() {
  const application = await startLocalApplication(4);
  const roles = ['publisher', 'subscriber', 'spectator'];
  const names = { publisher: 'Publisher', subscriber: 'Subscriber', spectator: 'Spectator' };
  const pages = Object.fromEntries(roles.map((role, index) => [role, application.pages[index]]));
  const display = application.pages[3];
  const observations = { 'private-cards-hidden': false, 'participant-mapping': false };
  let failed = false;
  let gameReconnected = false;
  const invalidate = error => {
    failed = true;
    observations['private-cards-hidden'] = false;
    observations['participant-mapping'] = false;
    throw error;
  };
  const views = () => Promise.all(application.pages.map(page => page.evaluate(() => window.pokerStore.state.view)));
  try {
    for (const role of roles.slice(0, 2)) {
      await pages[role].evaluate(async name => { window.pokerStore.setName(name); await window.pokerStore.join('casino'); }, names[role]);
      await pages[role].waitForFunction(() => Boolean(window.pokerStore.state.view?.you));
    }
    await startHand(pages.publisher);
    for (const role of roles.slice(0, 2)) {
      await pages[role].evaluate(async () => {
        localStorage.setItem('beginner', 'true');
        const guide = await import('/src/guide.ts');
        guide.want('table');
      });
      await pages[role].waitForFunction(() => window.pokerStore.state.view?.holds?.some(hold => hold.playerId === window.pokerStore.state.view.you && hold.kind === 'learn'));
    }
    await pages.spectator.evaluate(async name => { window.pokerStore.setName(name); await window.pokerStore.join('casino'); }, names.spectator);
    await display.evaluate(() => window.pokerStore.joinBoard('casino'));
    await display.waitForFunction(() => window.pokerStore.state.view?.display === true);
    const identities = {};
    for (const role of roles) identities[role] = { id: await pages[role].evaluate(() => window.pokerStore.state.view.you), name: names[role] };
    assert.equal(new Set(Object.values(identities).map(value => value.id)).size, 3);
    assertPrivateCards(await views(), [identities.publisher.id, identities.subscriber.id]);
    assert.equal(await display.locator('.board-screen').count(), 1);
    const applicationClients = {
      pages, identities,
      async applyGrants(grants) {
        try {
          for (const role of roles) {
            const page = pages[role];
            const grant = grants[role + 'Grant'];
            assert.ok(grant && grant.room === grants.room);
            await page.evaluate(() => window.mediaVerification.bindVideo(window.pokerVideo));
            let replaced = false;
            let fixtureError;
            await page.route(application.serverURL + '/r/casino/join', async route => {
              try {
                const response = await route.fetch();
                const body = await response.json();
                assert.equal(body.playerId, identities[role].id);
                assert.ok(body.video === null, 'local-server-must-not-create-provider-grants');
                replaced = true;
                await route.fulfill({ response, json: { ...body, video: grant } });
              } catch (error) {
                fixtureError = error;
                await route.abort('failed');
              }
            });
            await page.evaluate(() => window.pokerStore.join('casino'));
            if (fixtureError) throw fixtureError;
            assert.equal(replaced, true, 'grant-response-fixture-not-observed');
            await page.waitForFunction(room => window.pokerStore.state.video?.room === room, grant.room);
          }
        } catch (error) { invalidate(error); }
      },
      async enterDisplay(role, page) {
        try {
          assert.ok(page === pages[role], 'application-page-identity');
          await page.evaluate(() => window.pokerStore.joinBoard('casino'));
          await page.waitForFunction(() => window.pokerStore.state.view?.display === true);
        } catch (error) { invalidate(error); }
      },
      async observe(role, phase, page) {
        try {
          assert.ok(page === pages[role], 'application-page-identity');
          if (phase === 'frames' && role !== 'publisher') {
            const publisher = identities.publisher;
            if (!gameReconnected) {
              const frame = page.waitForEvent('websocket', socket => socket.url().endsWith('/r/casino/ws'))
                .then(socket => socket.waitForEvent('framereceived', message => JSON.parse(String(message.payload)).type === 'view'));
              await page.evaluate(() => { window.pokerStore.sleep(); window.pokerStore.wake(); });
              await frame;
              assert.equal(await page.evaluate(() => window.pokerStore.state.view.you), identities[role].id);
              gameReconnected = true;
            }
            await page.waitForFunction(id => {
              const view = window.pokerStore.state.view;
              const player = view?.players.find(item => item.id === id);
              if (!player) return false;
              return [...document.querySelectorAll('.seat')].some(seat => seat.querySelector('.name')?.textContent.replace(/\s*★$/, '') === player.name && (seat.querySelector('video')?.getVideoPlaybackQuality().totalVideoFrames ?? 0) > 0);
            }, publisher.id);
            const observation = await page.evaluate(id => {
              const view = window.pokerStore.state.view;
              const player = view.players.find(item => item.id === id);
              const source = window.pokerVideo.room?.remoteParticipants.get(id)?.getTrackPublication('camera')?.track?.mediaStreamTrack;
              const seats = [...document.querySelectorAll('.seat')].map(seat => {
                const name = seat.querySelector('.name')?.textContent.replace(/\s*★$/, '');
                const video = seat.querySelector('video');
                return { name, playerId: view.players.find(item => item.name === name)?.id, track: video?.srcObject?.getVideoTracks()[0]?.id ?? null,
                  frames: video?.getVideoPlaybackQuality().totalVideoFrames ?? 0 };
              });
              return { playerId: player?.id, name: player?.name, sourceTrack: source?.id, seats,
                receivedFrames: seats.find(seat => seat.playerId === id)?.frames ?? 0 };
            }, publisher.id);
            assertParticipantMapping(observation, publisher.id, publisher.name);
            assert.throws(() => assertParticipantMapping({ ...observation, playerId: identities.subscriber.id }, publisher.id, publisher.name));
            assert.throws(() => assertParticipantMapping(null, publisher.id, publisher.name));
            const actualViews = await views();
            assertPrivateCards(actualViews, [identities.publisher.id, identities.subscriber.id]);
            for (const publicPage of [pages.spectator, display]) {
              const rendering = await publicPage.evaluate(() => ({ faces: document.querySelectorAll('.card.face').length, board: window.pokerStore.state.view.hand.board.length }));
              assertPublicRendering(rendering.faces, rendering.board);
            }
            const exposed = structuredClone(actualViews);
            exposed[3].players[0].cards[0] = actualViews[0].players.find(player => player.id === identities.publisher.id).cards[0];
            assert.throws(() => assertPrivateCards(exposed, [identities.publisher.id, identities.subscriber.id]));
            if (!failed) {
              observations['private-cards-hidden'] = true;
              observations['participant-mapping'] = true;
            }
          } else if (phase === 'display') {
            const view = await page.evaluate(() => window.pokerStore.state.view);
            assert.equal(view.display, true);
            assert.equal(view.you, '');
            assert.equal(view.odds, null);
            assert.ok(view.players.every(player => player.cards.every(card => card === null)));
            assert.equal(await page.locator('.board-screen').count(), 1);
            assertPublicRendering(await page.locator('.card.face').count(), view.hand.board.length);
          }
        } catch (error) {
          invalidate(error);
        }
      },
    };
    return { applicationClients, observations, close: application.close };
  } catch (error) {
    await application.close();
    throw error;
  }
}
