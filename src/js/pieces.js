import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Piece meshes built from code: Lathe for the round pieces, Extrude for the knight's head.
// All geometry is in "piece units": 1 = PIECE_SIZE, base center at the origin, +Y up.
// Heights: pawn 0.83 < knight 1.16 < bishop 1.20 < rook 1.32 < queen 1.52 < king 1.70.

const SEGMENTS = 20; // around the lathe; keeps 32 pieces well under 50k triangles

// Points along a circle arc from angle a0 to a1 (degrees), as [r, y] lathe profile points.
function arc(cx, cy, radius, a0, a1, steps) {
    const points = [];
    for (let i = 0; i <= steps; i++) {
        const a = THREE.MathUtils.degToRad(a0 + (a1 - a0) * (i / steps));
        points.push([cx + radius * Math.cos(a), cy + radius * Math.sin(a)]);
    }
    return points;
}

// Spin a [r, y] profile (bottom center to top center) around the Y axis.
function lathe(profile) {
    return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(Math.max(r, 0), y)), SEGMENTS);
}

// A box of size (w, h, d) whose bottom-center sits at (x, y, z).
function box(w, h, d, x, y, z) {
    return new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);
}

// Stepped foot shared by every piece, ending at the radius where the stem starts.
const foot = (r) => [[0, 0], [r, 0], [r, 0.06], [r - 0.05, 0.10], [r - 0.07, 0.14]];

// Merge parts into one geometry (one mesh per piece keeps raycasting and tinting simple).
const merge = (parts) => mergeGeometries(parts.map((g) => g.index ? g.toNonIndexed() : g));

function pawn() {
    return lathe([
        ...foot(0.34), [0.18, 0.18], [0.13, 0.42], [0.20, 0.46], [0.20, 0.48], [0.11, 0.52],
        ...arc(0, 0.66, 0.17, -55, 90, 8),
    ]);
}

function bishop() {
    return lathe([
        ...foot(0.38), [0.20, 0.22], [0.13, 0.60], [0.21, 0.64], [0.21, 0.67], [0.12, 0.70],
        [0.16, 0.78], [0.17, 0.88], [0.14, 0.97], [0.09, 1.04], [0.04, 1.09],
        ...arc(0, 1.15, 0.05, -60, 90, 5),
    ]);
}

function rook() {
    const body = lathe([
        ...foot(0.40), [0.24, 0.24], [0.21, 0.80], [0.28, 0.86], [0.28, 1.12], [0.20, 1.12], [0.20, 1.04], [0, 1.04],
    ]);
    // Four merlins around the rim.
    const merlins = [0, 1, 2, 3].map((i) =>
        box(0.11, 0.20, 0.08, 0, 1.12, 0.24).rotateY(i * Math.PI / 2 + Math.PI / 4));
    return merge([body, ...merlins]);
}

function queen() {
    return lathe([
        ...foot(0.42), [0.22, 0.26], [0.14, 0.95], [0.24, 1.00], [0.24, 1.03], [0.15, 1.07],
        [0.19, 1.20], [0.25, 1.36], [0.22, 1.39], [0.08, 1.38],
        ...arc(0, 1.44, 0.08, -50, 90, 6),
    ]);
}

function king() {
    const body = lathe([
        ...foot(0.43), [0.23, 0.27], [0.15, 1.00], [0.25, 1.05], [0.25, 1.08], [0.16, 1.12],
        [0.20, 1.30], [0.22, 1.40], [0.14, 1.44], [0.06, 1.46], [0, 1.46],
    ]);
    return merge([body, box(0.07, 0.24, 0.07, 0, 1.46, 0), box(0.18, 0.06, 0.07, 0, 1.56, 0)]);
}

function knight() {
    const base = lathe([...foot(0.40), [0.30, 0.17], [0.28, 0.20], [0, 0.20]]);
    // Horse-head silhouette in the XY plane, facing +X.
    const outline = [
        [0.24, 0.18], [0.18, 0.40], [0.10, 0.56], [0.30, 0.66], [0.34, 0.76], [0.30, 0.86], [0.10, 0.98],
        [0.04, 1.10], [-0.02, 1.12], [-0.08, 1.04], [-0.20, 0.96], [-0.26, 0.70], [-0.24, 0.40], [-0.28, 0.18],
    ];
    const shape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
    const depth = 0.18;
    const bevel = 0.03;
    const head = new THREE.ExtrudeGeometry(shape, {
        depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2,
    }).translate(0, 0, -depth / 2);
    // Bevel pushes the bottom edge below y = 0.18; that part hides inside the base.
    return merge([base, head]);
}

const builders = { p: pawn, n: knight, b: bishop, r: rook, q: queen, k: king };
const geometries = {}; // built on first use and shared by every piece of that type

// Hook for Blender .glb models (#437): pass a geometry in piece units (base center at the origin,
// 1 = PIECE_SIZE, knight facing +X). Pieces created afterwards use it; callers don't change.
export function setPieceGeometry(type, geometry) {
    geometries[type] = geometry;
}

export function pieceGeometry(type) {
    if (!builders[type]) throw new Error(`Bad piece type: ${type}`);
    return geometries[type] ??= builders[type]();
}

const COLORS = { w: 0xEEE6D8, b: 0x2B2B2B }; // placeholders until #409/#410 add the wood materials

// type: 'p' 'n' 'b' 'r' 'q' 'k' (chess.js letters), color: 'w' | 'b', size: world units per piece unit.
// Each piece gets its own material so hover/select tints affect only it; userData.color holds its base color.
export function createPiece(type, color, size = 1) {
    if (!COLORS[color]) throw new Error(`Bad piece color: ${color}`);
    const mesh = new THREE.Mesh(pieceGeometry(type), new THREE.MeshStandardMaterial({ color: COLORS[color], roughness: 0.5 }));
    mesh.scale.setScalar(size);
    if (color === 'b') mesh.rotation.y = Math.PI; // Black's knights face the other way
    mesh.userData.type = type;
    mesh.userData.color = COLORS[color];
    return mesh;
}
