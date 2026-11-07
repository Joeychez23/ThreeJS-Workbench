// Self-check for board.js labels: run `node src/js/board.check.mjs`.
import assert from 'node:assert/strict';
import { labelLayout } from './board.js';

for (const flipped of [false, true]) {
    const spots = labelLayout(flipped);
    assert.equal(new Set(spots.map((s) => s.text)).size, 16, 'a-h and 1-8, once each');
    const a = spots.find((s) => s.text === 'a');
    const one = spots.find((s) => s.text === '1');
    assert.equal(a.col, 0, 'file a stays over file a');
    assert.equal(one.row, 7, 'rank 1 stays beside rank 1');
    // Files on the viewer's near edge, ranks on their left: White sits at row 8 / col -1, Black at row -1 / col 8.
    assert.equal(a.row, flipped ? -1 : 8);
    assert.equal(one.col, flipped ? 8 : -1);
    assert.ok(spots.every((s) => s.turn === (flipped ? Math.PI : 0)), 'labels read upright from the viewing side');
}
console.log('board labels - ok');
