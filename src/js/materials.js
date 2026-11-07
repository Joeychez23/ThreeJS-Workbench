import * as THREE from 'three';

// Theme materials, created once and shared by every mesh that uses them.
// Wood tones sit outside the 2D board's square colors (light ≈ #9c784d, dark ≈ #61432a, sampled from chess-board.jpg)
// so pieces stand out on both squares.

// Tileable grayscale wood grain (vertical stripes that wobble), multiplied into each wood's color.
// A DataTexture, not a canvas, so it also builds outside the browser (pieces.check.mjs).
function grainTexture(size = 128) {
    const data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            // Whole periods across the tile in both directions keep the edges seamless.
            const wobble = 4 * Math.sin((y / size) * 2 * Math.PI * 2);
            const ring = Math.sin(((x + wobble) / size) * 2 * Math.PI * 6);
            const v = 255 * (0.86 + 0.1 * ring + 0.04 * Math.random());
            data.set([v, v, v, 255], (y * size + x) * 4);
        }
    }
    const texture = new THREE.DataTexture(data, size, size);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    return texture;
}

const grain = grainTexture();

const wood = (color) => new THREE.MeshStandardMaterial({ color, map: grain, roughness: 0.55, metalness: 0 });

export const maple = wood(0xE6CFA0);   // White's pieces
export const walnut = wood(0x3A2416);  // Black's pieces
export const gold = new THREE.MeshStandardMaterial({ color: 0xD4A63A, metalness: 0.8, roughness: 0.3 }); // crowns, collars, frame inlay (#412)

// Highlight variants of the woods (shared too); #410 refines how highlights read on both colors.
export const hovered = { maple: wood(0xE6CFA0), walnut: wood(0x3A2416) };
hovered.maple.emissive.set(0x403020);
hovered.walnut.emissive.set(0x403020);
export const selected = wood(0xFFEA00);
