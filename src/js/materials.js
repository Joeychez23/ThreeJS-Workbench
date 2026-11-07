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

// Fresnel rim glow: adds `rim` color where the surface turns away from the camera, so a piece's outline
// reads on any square from any angle. The color is a uniform, so every rimmed material shares one shader.
function withRim(material, rim) {
    material.userData.rim = { value: new THREE.Color(rim) };
    material.onBeforeCompile = (shader) => {
        shader.uniforms.rimColor = material.userData.rim;
        shader.fragmentShader = shader.fragmentShader
            .replace('void main() {', 'uniform vec3 rimColor;\nvoid main() {')
            .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
                totalEmissiveRadiance += rimColor * pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 3.0);`);
    };
    return material;
}

const wood = (color, rim) => withRim(new THREE.MeshStandardMaterial({ color, map: grain, roughness: 0.55, metalness: 0 }), rim);

const MAPLE = 0xF3E7CF;
const WALNUT = 0x3A2416;
const HIGHLIGHT_RIM = 0x55C8FF; // cool blue: unlike both woods, the board and the yellow target squares

export const maple = wood(MAPLE, 0x000000);   // White's pieces: light enough on both squares, no rim needed
export const walnut = wood(WALNUT, 0x5A4430); // Black's pieces: a warm rim keeps them readable on dark squares
export const gold = new THREE.MeshStandardMaterial({ color: 0xD4A63A, metalness: 0.8, roughness: 0.3 }); // crowns, collars, frame inlay (#412)

// Highlights add a strong blue rim instead of lightening, so they show on maple as well as walnut.
export const hovered = { maple: wood(MAPLE, HIGHLIGHT_RIM), walnut: wood(WALNUT, HIGHLIGHT_RIM) };
export const selected = wood(0xFFEA00, HIGHLIGHT_RIM); // yellow like the target squares
