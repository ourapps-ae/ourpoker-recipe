import assert from 'node:assert/strict';

export function assertPrivateCards(views, identities) {
  assert.equal(views.length, 4);
  for (const [index, view] of views.entries()) {
    assert.ok(view && view.hand && view.phase === 'betting', 'active-hand-required');
    assert.equal(view.players.length, 2, 'two-real-players-required');
    for (const player of view.players) {
      assert.equal(player.cards.length, 2);
      const own = index < 2 && player.id === identities[index];
      assert.ok(own ? player.cards.every(card => typeof card === 'string' && card.length > 0) : player.cards.every(card => card === null), 'private-card-isolation');
    }
    if (index < 2) assert.equal(view.you, identities[index]);
    else assert.ok(!view.players.some(player => player.id === view.you));
  }
  assert.equal(views[3].display, true);
  assert.equal(views[3].odds, null);
}

export function assertParticipantMapping(observation, identity, name) {
  assert.ok(observation && observation.receivedFrames > 0, 'live-frame-observation-required');
  assert.equal(observation.playerId, identity);
  assert.equal(observation.name, name);
  assert.ok(observation.sourceTrack, 'production-track-required');
  const matched = observation.seats.filter(seat => seat.track === observation.sourceTrack);
  assert.equal(matched.length, 1, 'track-must-map-to-one-seat');
  assert.equal(matched[0].name, name);
  assert.equal(matched[0].playerId, identity);
}

export function assertPublicRendering(faceCards, communityCards) {
  assert.ok(Number.isInteger(faceCards) && Number.isInteger(communityCards));
  assert.equal(faceCards, communityCards, 'public-renderer-exposes-private-cards');
}
