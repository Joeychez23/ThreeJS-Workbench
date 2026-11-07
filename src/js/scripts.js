import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createPiece, setPieceState, updateShadow } from './pieces.js';

// Debug tools (dat.gui panel, key light helper) load only with ?debug in the URL.
const DEBUG = new URLSearchParams(window.location.search).has('debug');

// Image URLs, resolved by Parcel at build time.
const stars = new URL('../img/stars.jpg', import.meta.url).href;
// 1024x1024 crop of chess-board.png holding exactly the 8x8 squares (frame removed), so cell i spans 128px.
const board = new URL('../img/chess-board.jpg', import.meta.url).href;

// ---------------------------------------------------------------------------
// Grid system
// ---------------------------------------------------------------------------

// The playable 8x8 area of the board, centered on the origin in the XZ plane.
const BOARD_SIZE = 24;                          // world units per board side
const GRID_DIVISIONS = 8;                       // cells per side
const CELL_SIZE = BOARD_SIZE / GRID_DIVISIONS;  // world units per cell
const PIECE_SIZE = CELL_SIZE * 0.8;             // one piece unit (pieces.js); bases leave a gap inside the cell

// Grid index (0..7) -> world coordinate of that cell's center.
const cellCenter = (i) => -BOARD_SIZE / 2 + CELL_SIZE * (i + 0.5);
// World coordinate -> grid index, clamped so anything off the board maps to the nearest edge cell.
const toCell = (v) => THREE.MathUtils.clamp(Math.floor((v + BOARD_SIZE / 2) / CELL_SIZE), 0, GRID_DIVISIONS - 1);

// ---------------------------------------------------------------------------
// Renderer, scene, camera
// ---------------------------------------------------------------------------

// The element the 3D view fills (sized by CSS, so it also works inside another page's layout).
const container = document.getElementById('board3d');

const renderer = new THREE.WebGLRenderer();
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
    75,     // vertical field of view (degrees)
    1,      // aspect ratio, set from the container by resize()
    0.1,    // near clipping plane
    1000    // far clipping plane
);

// Match the drawing buffer and camera to the container's current size.
// Pixel density is capped at 2 so 3x phones don't render 9x the pixels.
function resize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w === 0 || h === 0) return; // hidden or collapsed: keep the last size
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h, false); // false: CSS controls the canvas's display size
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera); // redraw now so the new size never shows a stretched frame
}

// Run resize work at most once per animation frame, however many events arrive.
let resizeQueued = false;
function queueResize() {
    if (resizeQueued) return;
    resizeQueued = true;
    requestAnimationFrame(function() {
        resizeQueued = false;
        resize();
    });
}

resize();
new ResizeObserver(queueResize).observe(container);
// Rotation usually resizes the container too, but some mobile browsers report the new size late.
if (screen.orientation) screen.orientation.addEventListener('change', queueResize);
else window.addEventListener('orientationchange', queueResize);

// Starfield background.
const textureLoader = new THREE.TextureLoader();
const background = textureLoader.load(stars);
background.colorSpace = THREE.SRGBColorSpace;
scene.background = background;

// ---------------------------------------------------------------------------
// Camera controls
// ---------------------------------------------------------------------------

const orbit = new OrbitControls(camera, renderer.domElement);
// Left-drag pans, right-drag rotates. Scroll zooms, and so does right-click + scroll (below).
orbit.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };

// OrbitControls ignores the wheel mid-drag, so zoom manually while the right button is held.
renderer.domElement.addEventListener('wheel', function(e) {
    if (!(e.buttons & 2)) return; // right button not held: OrbitControls' own zoom handles it
    e.preventDefault();
    // Move the camera 5% closer/farther along its line to the orbit target, within the zoom limits.
    const offset = camera.position.clone().sub(orbit.target);
    const distance = THREE.MathUtils.clamp(
        offset.length() * Math.pow(1.05, Math.sign(e.deltaY)),
        orbit.minDistance,
        orbit.maxDistance
    );
    camera.position.copy(orbit.target).add(offset.setLength(distance));
    orbit.update();
}, { passive: false }); // passive: false so preventDefault() is allowed

// Red/green/blue = X/Y/Z axes at the origin.
const axesHelper = new THREE.AxesHelper(3);
scene.add(axesHelper);

// Starting camera position (looking down at the board at an angle).
camera.position.set(-10, 30, 30);
orbit.update();

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

// Movable pieces from createPiece(), each snapped to a cell center.
const pieces = []; // every piece mesh, used only for raycasting; lookups go through the grid

// The board's source of truth: grid[row][col] holds the mesh on that square, or null.
// Same layout as chess.js's board(): row 0 is rank 8, row 7 is rank 1, col 0 is file a.
// World +Z faces the starting camera, so a1 sits bottom-left from White's side.
const FILES = 'abcdefgh';
const grid = Array.from({ length: GRID_DIVISIONS }, () => Array(GRID_DIVISIONS).fill(null));

// "e4" -> { col: 4, row: 4 }. Throws on anything that isn't a1..h8.
function squareToCell(square) {
    const col = FILES.indexOf(square[0]);
    const rank = Number(square[1]);
    if (square.length !== 2 || col < 0 || !(rank >= 1 && rank <= 8)) throw new Error(`Bad square: ${square}`);
    return { col, row: GRID_DIVISIONS - rank };
}

// (col, row) -> "e4".
function cellToSquare(col, row) {
    return FILES[col] + (GRID_DIVISIONS - row);
}

// The mesh on a square, or null. O(1).
function pieceAt(square) {
    const { col, row } = squareToCell(square);
    return grid[row][col];
}

// Take whatever is on a square off the grid and return it (the mesh stays in the scene).
function removeFrom(square) {
    const { col, row } = squareToCell(square);
    const mesh = grid[row][col];
    grid[row][col] = null;
    if (mesh) mesh.userData.square = null;
    return mesh;
}

// Move a mesh to a square: the only place grid entries and mesh positions change, so they can't disagree.
// Throws if another piece is already there.
function placeOnSquare(mesh, square) {
    const { col, row } = squareToCell(square);
    const occupant = grid[row][col];
    if (occupant && occupant !== mesh) throw new Error(`${square} is occupied`);
    if (mesh.userData.square) removeFrom(mesh.userData.square);
    grid[row][col] = mesh;
    mesh.userData.square = square;
    showOnSquare(mesh, square);
}

// Draw a mesh centered on a square, resting on the board, without touching the grid (used mid-drag).
function showOnSquare(mesh, square) {
    const { col, row } = squareToCell(square);
    mesh.position.set(cellCenter(col), 0, cellCenter(row)); // piece origins sit at their base
}

// Move the piece on `from` to `to`, taking whatever was on `to` out of the scene (a capture).
// The renderer never calls this on its own: the caller's onMove decides whether a move happens.
export function movePiece(from, to) {
    const mesh = removeFrom(from);
    if (!mesh) return;
    const captured = removeFrom(to);
    if (captured) {
        scene.remove(captured);
        pieces.splice(pieces.indexOf(captured), 1);
        if (hovered === captured) hovered = null;
    }
    placeOnSquare(mesh, to);
}

// Create a piece (type and color as chess.js letters).
function addPiece(type, color, square) {
    const piece = createPiece(type, color, PIECE_SIZE);
    placeOnSquare(piece, square);
    scene.add(piece);
    pieces.push(piece);
}

// Starting position.
for (let col = 0; col < GRID_DIVISIONS; col++) {
    const file = FILES[col];
    const back = 'rnbqkbnr'[col];
    addPiece(back, 'w', file + 1);
    addPiece('p', 'w', file + 2);
    addPiece('p', 'b', file + 7);
    addPiece(back, 'b', file + 8);
}

// ---------------------------------------------------------------------------
// Board
// ---------------------------------------------------------------------------

const planeGeometry = new THREE.PlaneGeometry(BOARD_SIZE, BOARD_SIZE);
const planeMaterial = new THREE.MeshStandardMaterial({ color: 0xFFFFFF });
const plane = new THREE.Mesh(planeGeometry, planeMaterial);
scene.add(plane);
const boardProperties = textureLoader.load(board);
boardProperties.colorSpace = THREE.SRGBColorSpace; // sRGB so colors match the 2D board
// The image is already cropped to the squares, so it maps 1:1 onto the plane and lines up with cellCenter().
// Mipmaps keep it smooth when far away; anisotropy keeps it sharp at the camera's low viewing angle.
boardProperties.generateMipmaps = true;
boardProperties.minFilter = THREE.LinearMipmapLinearFilter;
boardProperties.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
plane.material.map = boardProperties;
plane.rotation.x = -0.5 * Math.PI; // lay the plane flat (it's created standing up in XY)

// Visible grid lines matching the 8x8 cells.
const gridHelper = new THREE.GridHelper(BOARD_SIZE, GRID_DIVISIONS);
gridHelper.position.y = 0.01; // just above the board to avoid z-fighting
scene.add(gridHelper);

// ---------------------------------------------------------------------------
// Lights
// ---------------------------------------------------------------------------

// Two lights, no shadow maps, so the cost stays flat however many pieces there are (blob shadows are in pieces.js).
// Fill: warm sky above, dark wood bounce below, so unlit sides keep some color.
const fillLight = new THREE.HemisphereLight(0xFFF4E0, 0x3A2A1A, 1.2);
scene.add(fillLight);

// Key light: high and to White's left, so pieces get a lit side and a shaded side from the default camera.
const keyLight = new THREE.DirectionalLight(0xFFFFFF, 2.2);
keyLight.position.set(-10, 25, 15);
scene.add(keyLight);

// White fog that thickens with distance.
scene.fog = new THREE.FogExp2(0xFFFFFF, 0.01);

// ---------------------------------------------------------------------------
// Debug tools (?debug): key light helper and a GUI panel (top right) for the lights
// ---------------------------------------------------------------------------

let keyLightHelper = null;

if (DEBUG) {
    keyLightHelper = new THREE.DirectionalLightHelper(keyLight, 3);
    scene.add(keyLightHelper);

    // Loaded on demand so dat.gui stays out of the normal bundle.
    import('dat.gui').then(function(dat) {
        const gui = new dat.GUI();
        gui.add(keyLight, 'intensity', 0, 5).name('key');
        gui.add(keyLight.position, 'x', -40, 40).name('key x');
        gui.add(keyLight.position, 'z', -40, 40).name('key z');
        gui.add(fillLight, 'intensity', 0, 3).name('fill');
    });
}

// ---------------------------------------------------------------------------
// Pointer interaction: mouse hovers, grabs and drags; touch and pen tap (see the next section)
// ---------------------------------------------------------------------------

// The renderer knows no chess rules; the caller supplies them through setMoveHandlers():
//   canMove(from, to) -> boolean  may the piece on `from` be dropped on `to`? (asked for every square on grab)
//   onMove(from, to)              a piece was dropped on a square canMove allowed; the caller decides what
//                                 happens, usually by calling movePiece(). Nothing changes on the board otherwise.
let canMove = () => false;
let onMove = () => {};
export function setMoveHandlers(handlers) {
    ({ canMove, onMove } = handlers);
}

// Drag-to-move: grab a piece, drag over the board, it snaps between the squares canMove allows.
const rayCaster = new THREE.Raycaster();
const pointer = new THREE.Vector2(); // mouse position in normalized device coords (-1..1)
let selected = null; // piece being dragged
let hovered = null;  // piece under the cursor (when not dragging)
let dragFrom = null; // square the dragged piece started on
let dragTo = null;   // square it will be dropped on (dragFrom means "put it back")
let legalTargets = new Set(); // squares canMove allowed for this drag

// Translucent squares marking where the dragged piece may go, one per square, built once.
const targetGeometry = new THREE.PlaneGeometry(CELL_SIZE * 0.9, CELL_SIZE * 0.9);
const targetMaterial = new THREE.MeshBasicMaterial({ color: 0xFFEA00, transparent: true, opacity: 0.35, depthWrite: false });
const targetMarkers = {};
for (let row = 0; row < GRID_DIVISIONS; row++) {
    for (let col = 0; col < GRID_DIVISIONS; col++) {
        const marker = new THREE.Mesh(targetGeometry, targetMaterial);
        marker.rotation.x = -0.5 * Math.PI;            // lie flat like the board
        marker.position.set(cellCenter(col), 0.02, cellCenter(row)); // above the grid lines
        marker.visible = false;
        scene.add(marker);
        targetMarkers[cellToSquare(col, row)] = marker;
    }
}

// Ask canMove about every square and mark the legal ones (or clear all marks with from = null).
function showTargets(from) {
    legalTargets = new Set();
    for (const square in targetMarkers) {
        const legal = from !== null && square !== from && canMove(from, square);
        if (legal) legalTargets.add(square);
        targetMarkers[square].visible = legal;
    }
}

// Hover: brighten the piece under the cursor and show a grab cursor.
function setHovered(piece) {
    if (hovered === piece) return;
    if (hovered) setPieceState(hovered, null);
    hovered = piece;
    if (hovered) setPieceState(hovered, 'hover');
    renderer.domElement.style.cursor = hovered ? 'grab' : '';
}

// Point the raycaster from the camera through the mouse position.
function aimRay(e) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    rayCaster.setFromCamera(pointer, camera);
}

// Grab: left-click on a piece selects it (yellow) and freezes the camera.
// Capture phase so this runs before OrbitControls' own pointerdown and can disable it.
renderer.domElement.addEventListener('pointerdown', function(e) {
    if (e.pointerType !== 'mouse') return touchDown(e); // fingers and pens tap instead of dragging
    if (e.button !== 0) return; // only left-click grabs blocks
    deselectTap(); // the mouse takes over from any tap selection
    aimRay(e);
    const [hit] = rayCaster.intersectObjects(pieces, false);
    if (!hit) return; // missed: let OrbitControls pan as usual
    hovered = null;
    selected = hit.object;
    dragFrom = dragTo = selected.userData.square;
    showTargets(dragFrom);
    setPieceState(selected, 'selected');
    renderer.domElement.style.cursor = 'grabbing';
    orbit.enabled = false;
}, { capture: true });

// Move: hover highlight when idle; while dragging, snap the piece to the square under the cursor if it's legal.
// On window (not the canvas) so a drag keeps working if the mouse leaves the canvas.
window.addEventListener('pointermove', function(e) {
    if (e.pointerType !== 'mouse') return touchMove(e); // no hover or drag for touch and pen
    aimRay(e);
    if (!selected) {
        // Skip hover when the mouse is over the GUI or another element on top of the canvas.
        const [hit] = e.target === renderer.domElement ? rayCaster.intersectObjects(pieces, false) : [];
        setHovered(hit ? hit.object : null);
        return;
    }
    const [hit] = rayCaster.intersectObject(plane, false);
    if (!hit) return; // cursor is off the board: leave the piece where it is
    const square = cellToSquare(toCell(hit.point.x), toCell(hit.point.z));
    if (square !== dragFrom && !legalTargets.has(square)) return; // illegal: stay on the last legal square
    dragTo = square;
    showOnSquare(selected, square); // visual only; the grid changes only if onMove moves it
});

// Drop: put the piece back on its grid square, then report the move and let the caller apply it.
window.addEventListener('pointerup', function(e) {
    if (e.pointerType !== 'mouse') return touchUp(e);
    if (!selected) return;
    const from = dragFrom;
    const to = dragTo;
    setPieceState(selected, null);
    showOnSquare(selected, selected.userData.square);
    showTargets(null);
    selected = dragFrom = dragTo = null;
    renderer.domElement.style.cursor = '';
    orbit.enabled = true;
    if (to !== from) onMove(from, to);
});

// ---------------------------------------------------------------------------
// Touch and pen: tap a piece, then tap a square (like the 2D game)
// ---------------------------------------------------------------------------

// Only a short press that barely moves is a tap; anything else is left to OrbitControls as a camera gesture.
const TAP_MAX_MOVE = 10;  // CSS px a finger may wander and still count as a tap
const TAP_MAX_MS = 400;   // longer presses are camera gestures
const activePointers = new Set(); // touch/pen pointers currently down; 2+ means pinch, never a tap
let tapStart = null;      // { id, x, y, time } of the press that may become a tap
let tapSelected = null;   // piece chosen by a tap, waiting for a target square

// The canvas handles every touch itself: no browser scrolling, pinch-zoom, double-tap zoom or long-press menu.
renderer.domElement.style.touchAction = 'none';
renderer.domElement.style.webkitTouchCallout = 'none';
renderer.domElement.style.userSelect = 'none';

function touchDown(e) {
    activePointers.add(e.pointerId);
    tapStart = activePointers.size === 1 ? { id: e.pointerId, x: e.clientX, y: e.clientY, time: e.timeStamp } : null;
}

function touchMove(e) {
    if (tapStart && e.pointerId === tapStart.id
        && Math.hypot(e.clientX - tapStart.x, e.clientY - tapStart.y) > TAP_MAX_MOVE) tapStart = null;
}

function touchUp(e) {
    activePointers.delete(e.pointerId);
    const start = tapStart;
    if (!start || e.pointerId !== start.id) return;
    tapStart = null;
    if (e.timeStamp - start.time > TAP_MAX_MS) return;
    if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > TAP_MAX_MOVE) return;
    handleTap(e);
}

// The browser took the pointer (e.g. a system gesture): forget it, and it's not a tap.
window.addEventListener('pointercancel', function(e) {
    activePointers.delete(e.pointerId);
    if (tapStart && e.pointerId === tapStart.id) tapStart = null;
});

// What a tap landed on: a piece and its square, an empty board square, or nothing (off the board).
function tapTarget(e) {
    aimRay(e);
    const [pieceHit] = rayCaster.intersectObjects(pieces, false);
    if (pieceHit) return { piece: pieceHit.object, square: pieceHit.object.userData.square };
    const [boardHit] = rayCaster.intersectObject(plane, false);
    if (!boardHit) return { piece: null, square: null };
    return { piece: null, square: cellToSquare(toCell(boardHit.point.x), toCell(boardHit.point.z)) };
}

// Tap a piece to select it; tap a legal square (empty or a capture) to move there.
// Tapping the same piece or anywhere else deselects; tapping another movable piece switches to it.
function handleTap(e) {
    const { piece, square } = tapTarget(e);
    if (tapSelected) {
        const from = tapSelected.userData.square;
        const again = piece === tapSelected;
        const legal = square !== null && legalTargets.has(square);
        deselectTap();
        if (legal) return onMove(from, square);
        if (again) return;
    }
    if (piece) selectByTap(piece);
}

// Select a piece only if canMove allows it somewhere, so pieces that can't move (e.g. the opponent's) ignore taps.
function selectByTap(piece) {
    showTargets(piece.userData.square);
    if (legalTargets.size === 0) return;
    tapSelected = piece;
    setPieceState(piece, 'selected');
}

function deselectTap() {
    if (!tapSelected) return;
    setPieceState(tapSelected, null);
    tapSelected = null;
    showTargets(null);
}

// ---------------------------------------------------------------------------
// Workbench rules stub (a real game passes chess.js-backed handlers instead)
// ---------------------------------------------------------------------------

// Queen-style lines with no blocking; dropping on any piece captures it.
setMoveHandlers({
    canMove(from, to) {
        const a = squareToCell(from);
        const b = squareToCell(to);
        const dc = Math.abs(a.col - b.col);
        const dr = Math.abs(a.row - b.row);
        return dc === 0 || dr === 0 || dc === dr;
    },
    onMove: movePiece,
});

// ---------------------------------------------------------------------------
// Render loop
// ---------------------------------------------------------------------------

function animate() {
    if (keyLightHelper) keyLightHelper.update(); // follow GUI changes to the key light
    for (const piece of pieces) updateShadow(piece); // shadows stay on the board as pieces lift
    renderer.render(scene, camera);
}

renderer.setAnimationLoop(animate);

