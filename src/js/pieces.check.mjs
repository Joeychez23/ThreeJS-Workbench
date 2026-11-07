// Self-check for pieces.js: run `node src/js/pieces.check.mjs`.
import assert from 'node:assert/strict';
import { pieceGeometry, createPiece } from './pieces.js';

const counts = { p: 16, n: 4, b: 4, r: 4, q: 2, k: 2 };
let total = 0;
const heights = {};
for (const type in counts) {
    const g = pieceGeometry(type);
    g.computeBoundingBox();
    const { min, max } = g.boundingBox;
    const tris = (g.index ? g.index.count : g.attributes.position.count) / 3;
    total += tris * counts[type];
    heights[type] = max.y;
    assert.ok(Math.abs(min.y) < 1e-6, `${type} base not at y=0 (${min.y})`);
    assert.ok(Math.max(-min.x, max.x, -min.z, max.z) <= 0.5, `${type} wider than its cell`);
    console.log(type, 'tris', tris, 'height', max.y.toFixed(2));
}
const h = heights;
assert.ok(h.p < h.n && h.p < h.b && h.n < h.r && h.b < h.r && h.r < h.q && h.q < h.k, 'height order');
assert.ok(total < 50000, `32 pieces = ${total} triangles`);
assert.equal(createPiece('n', 'b', 2.4).scale.x, 2.4);
assert.throws(() => createPiece('x', 'w'));
console.log('32 pieces:', total, 'triangles - ok');
