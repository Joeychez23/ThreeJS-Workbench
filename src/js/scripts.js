import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// Debug tools (dat.gui panel, spotlight helper) load only with ?debug in the URL.
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
const PIECE_SIZE = CELL_SIZE * 0.8;             // pieces leave a small gap inside their cell

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

// Movable pieces, each one cell-sized and snapped to a cell center.
const boxGeometry = new THREE.BoxGeometry(PIECE_SIZE, PIECE_SIZE, PIECE_SIZE); // shared by all pieces
const pieces = []; // everything the mouse can hover and grab

// Center a piece on cell (col, row), resting on top of the board.
function placeOnCell(piece, col, row) {
    piece.position.set(cellCenter(col), PIECE_SIZE / 2, cellCenter(row));
}

// Create a piece; its base color is kept in userData so hover/select tints can be undone.
function addPiece(color, col, row) {
    const piece = new THREE.Mesh(boxGeometry, new THREE.MeshBasicMaterial({ color }));
    piece.userData.color = color;
    placeOnCell(piece, col, row);
    scene.add(piece);
    pieces.push(piece);
}

addPiece(0x00FF00, 3, 3);
addPiece(0xFF0000, 0, 7);
addPiece(0x0000FF, 7, 0);
addPiece(0xFF00FF, 2, 5);
addPiece(0x00FFFF, 5, 2);

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

// Dim fill light so unlit sides aren't pitch black.
const ambientLight = new THREE.AmbientLight(0x333333);
scene.add(ambientLight);

// Main light (Phase 2 replaces it with a directional key light).
const spotlight = new THREE.SpotLight(0xFFFFFF);
scene.add(spotlight);
spotlight.position.set(-100, 100, 0);
spotlight.angle = 0.2;
spotlight.penumbra = 0;
spotlight.intensity = 1;

// White fog that thickens with distance.
scene.fog = new THREE.FogExp2(0xFFFFFF, 0.01);

// ---------------------------------------------------------------------------
// Debug tools (?debug): spotlight helper and a GUI panel (top right) for the spotlight
// ---------------------------------------------------------------------------

let sLightHelper = null;

if (DEBUG) {
    sLightHelper = new THREE.SpotLightHelper(spotlight);
    scene.add(sLightHelper);

    // Loaded on demand so dat.gui stays out of the normal bundle.
    import('dat.gui').then(function(dat) {
        const gui = new dat.GUI();
        gui.add(spotlight, 'angle', 0, 1);
        gui.add(spotlight, 'penumbra', 0, 1);
        gui.add(spotlight, 'intensity', 0, 100000);
    });
}

// ---------------------------------------------------------------------------
// Mouse interaction: hover, grab and drag pieces
// ---------------------------------------------------------------------------

// Drag-to-move: grab a piece, drag over the board, it snaps cell to cell.
const rayCaster = new THREE.Raycaster();
const pointer = new THREE.Vector2(); // mouse position in normalized device coords (-1..1)
let selected = null; // piece being dragged
let hovered = null;  // piece under the cursor (when not dragging)

// Hover: lighten the piece under the cursor and show a grab cursor.
function setHovered(piece) {
    if (hovered === piece) return;
    if (hovered) hovered.material.color.set(hovered.userData.color);
    hovered = piece;
    if (hovered) hovered.material.color.set(hovered.userData.color).offsetHSL(0, 0, 0.25);
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
    if (e.button !== 0) return; // only left-click grabs blocks
    aimRay(e);
    const [hit] = rayCaster.intersectObjects(pieces, false);
    if (!hit) return; // missed: let OrbitControls pan as usual
    hovered = null;
    selected = hit.object;
    selected.material.color.set(0xFFEA00);
    renderer.domElement.style.cursor = 'grabbing';
    orbit.enabled = false;
}, { capture: true });

// Move: hover highlight when idle; while dragging, snap the piece to the cell under the cursor.
// On window (not the canvas) so a drag keeps working if the mouse leaves the canvas.
window.addEventListener('pointermove', function(e) {
    aimRay(e);
    if (!selected) {
        // Skip hover when the mouse is over the GUI or another element on top of the canvas.
        const [hit] = e.target === renderer.domElement ? rayCaster.intersectObjects(pieces, false) : [];
        setHovered(hit ? hit.object : null);
        return;
    }
    const [hit] = rayCaster.intersectObject(plane, false);
    if (!hit) return; // cursor is off the board: leave the piece where it is
    const col = toCell(hit.point.x);
    const row = toCell(hit.point.z);
    // Don't stack pieces: only move into an empty cell.
    const occupied = pieces.some(p => p !== selected && toCell(p.position.x) === col && toCell(p.position.z) === row);
    if (!occupied) placeOnCell(selected, col, row);
});

// Drop: restore the piece's color and give the camera back to OrbitControls.
window.addEventListener('pointerup', function() {
    if (!selected) return;
    selected.material.color.set(selected.userData.color);
    selected = null;
    renderer.domElement.style.cursor = '';
    orbit.enabled = true;
});

// ---------------------------------------------------------------------------
// Render loop
// ---------------------------------------------------------------------------

function animate() {
    if (sLightHelper) sLightHelper.update(); // follow GUI changes to the spotlight
    renderer.render(scene, camera);
}

renderer.setAnimationLoop(animate);

