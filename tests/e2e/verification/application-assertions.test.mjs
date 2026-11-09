import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertPrivateCards, assertParticipantMapping, assertPublicRendering } from './application-assertions.mjs';

const view = (you, display = false) => ({ you, display, odds: null, phase: 'betting', hand: { no: 1 }, players: ['a', 'b'].map(id => ({ id, cards: id === you ? ['Ac', 'Kd'] : [null, null] })) });
test('fixture: privacy requires actual own cards and rejects exposed spectator/display cards', () => {
  const views = [view('a'), view('b'), view('spectator'), view('', true)];
  assertPrivateCards(views, ['a', 'b']);
  for (const [index, player] of [[0, 1], [2, 0], [3, 1]]) {
    const wrong = structuredClone(views);
    wrong[index].players[player].cards[0] = 'Qs';
    assert.throws(() => assertPrivateCards(wrong, ['a', 'b']));
  }
  const vacuous = structuredClone(views);
  vacuous[0].players[0].cards = [null, null];
  assert.throws(() => assertPrivateCards(vacuous, ['a', 'b']));
  assert.throws(() => assertPrivateCards([], ['a', 'b']));
  assertPublicRendering(0, 0);
  assert.throws(() => assertPublicRendering(1, 0));
  assert.throws(() => assertPublicRendering(undefined, 0));
});

test('fixture: participant mapping rejects wrong seat, wrong identity and missing frames', () => {
  const observed = { playerId: 'a', name: 'Publisher', receivedFrames: 2, sourceTrack: 'track-a', seats: [{ name: 'Publisher', playerId: 'a', track: 'track-a' }, { name: 'Subscriber', playerId: 'b', track: 'track-b' }] };
  assertParticipantMapping(observed, 'a', 'Publisher');
  assert.throws(() => assertParticipantMapping({ ...observed, playerId: 'b' }, 'a', 'Publisher'));
  assert.throws(() => assertParticipantMapping({ ...observed, receivedFrames: 0 }, 'a', 'Publisher'));
  assert.throws(() => assertParticipantMapping({ ...observed, seats: [{ name: 'Subscriber', playerId: 'b', track: 'track-a' }] }, 'a', 'Publisher'));
  assert.throws(() => assertParticipantMapping(null, 'a', 'Publisher'));
});
