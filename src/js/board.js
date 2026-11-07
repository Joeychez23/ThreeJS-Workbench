import * as THREE from 'three';
import { frameWood, gold, baize } from './materials.js';

// The board's surroundings: a walnut frame with gold inlay and a-h / 1-8 labels, on a green baize table.
// Proportions follow the 2D board (client/src/js/gameplay/layout): labels sit COORD_BORDER_RATIO squares
// out from the playing area, in the band between the frame's two gold lines.
const COORD_BORDER_RATIO = 0.285;
const BORDER = 0.75;            // frame width, in squares
const INLAYS = [[0.04, 0.08], [0.49, 0.53]]; // gold lines, [inner, outer] distance from the board edge, in squares
const FRAME_DEPTH = 0.25;       // frame thickness below the board surface, in squares
export const LABEL_COLOR = '#d9b27a'; // the 2D board's coordinate gold

// Where each label goes and which way it reads, matching the 2D board: files along the viewer's bottom edge,
// ranks up the viewer's left. Grid coordinates (col, row) as in scripts.js: col 0 = file a, row 0 = rank 8.
// Flipped (Black's view) the labels move to the far and right edges and turn 180° to face the other side.
// `edge` is the label's distance past the board edge, in squares; `turn` is its rotation in the board plane.
export function labelLayout(flipped) {
    const spots = [];
    for (let i = 0; i < 8; i++) {
        spots.push({ text: 'abcdefgh'[i], col: i, row: flipped ? -1 : 8, turn: flipped ? Math.PI : 0 });
        spots.push({ text: String(8 - i), col: flipped ? 8 : -1, row: i, turn: flipped ? Math.PI : 0 });
    }
    return spots;
}

// A square frame outline (outer square minus inner square) lying flat at height y.
function squareRing(inner, outer, material, y) {
    const shape = new THREE.Shape().moveTo(-outer, -outer).lineTo(outer, -outer).lineTo(outer, outer).lineTo(-outer, outer);
    shape.holes.push(new THREE.Path().moveTo(-inner, -inner).lineTo(-inner, inner).lineTo(inner, inner).lineTo(inner, -inner));
    const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), material);
    mesh.rotation.x = -0.5 * Math.PI;
    mesh.position.y = y;
    return mesh;
}

// One label's texture: gold text on transparent, drawn like the 2D board's drawCoordinates().
function labelTexture(text) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.font = '600 44px Archivo, "Helvetica Neue", Arial, sans-serif';
    ctx.fillStyle = LABEL_COLOR;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 32, 34);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

// Build the frame and table around a board of `boardSize` world units centered on the origin, top at y = 0.
// Returns the group and setFlipped(flipped), which moves the labels to the viewing side.
export function createSurroundings(boardSize) {
    const cell = boardSize / 8;
    const half = boardSize / 2;
    const group = new THREE.Group();

    // Walnut block the board image lies on; its top sits a hair below y = 0 so the board plane wins.
    const outer = boardSize + 2 * BORDER * cell;
    const depth = FRAME_DEPTH * cell;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(outer, depth, outer), frameWood);
    frame.position.y = -depth / 2 - 0.005;
    group.add(frame);

    for (const [a, b] of INLAYS) group.add(squareRing(half + a * cell, half + b * cell, gold, 0.004));

    // Baize table under the frame, wide enough to fill the view; fog (scripts.js) fades its far edge.
    const table = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), baize);
    table.rotation.x = -0.5 * Math.PI;
    table.position.y = -depth - 0.01;
    group.add(table);

    // Labels: one shared quad, one texture each, created once and only repositioned on flip.
    const labelGeometry = new THREE.PlaneGeometry(cell * 0.4, cell * 0.4);
    const labels = new Map();
    for (const { text } of labelLayout(false)) {
        const mesh = new THREE.Mesh(labelGeometry, new THREE.MeshBasicMaterial({ map: labelTexture(text), transparent: true, depthWrite: false }));
        labels.set(text, mesh);
        group.add(mesh);
    }

    // Grid index -> world coordinate; -1 and 8 are the label bands just outside the board.
    const at = (i) => i < 0 ? -half - COORD_BORDER_RATIO * cell
        : i > 7 ? half + COORD_BORDER_RATIO * cell
        : -half + cell * (i + 0.5);

    function setFlipped(flipped) {
        for (const { text, col, row, turn } of labelLayout(flipped)) {
            const mesh = labels.get(text);
            mesh.position.set(at(col), 0.006, at(row));
            mesh.rotation.set(-0.5 * Math.PI, 0, turn); // lie flat; turn within the board plane
        }
    }
    setFlipped(false);

    return { group, setFlipped };
}
