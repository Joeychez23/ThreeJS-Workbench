import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import * as dat from 'dat.gui';

const nebula = new URL('../img/nebula.jpg', import.meta.url).href;
const stars = new URL('../img/stars.jpg', import.meta.url).href

const renderer = new THREE.WebGLRenderer();

renderer.shadowMap.enabled = true;

renderer.setSize(window.innerWidth, window.innerHeight);

document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / innerHeight,
    0.1,
    1000
);

const orbit = new OrbitControls(camera, renderer.domElement);

const axesHelper = new THREE.AxesHelper(3);
scene.add(axesHelper);

camera.position.z = 5;
camera.position.y = 2;

camera.position.set(-10, 30, 30);
orbit.update();

const boxGeometry = new THREE.BoxGeometry();
const boxMaterial = new THREE.MeshBasicMaterial({ color: 0x00FF00 });
const box = new THREE.Mesh(boxGeometry, boxMaterial);
scene.add(box);

const planeGeometry = new THREE.PlaneGeometry(30, 30);
const planeMaterial = new THREE.MeshStandardMaterial(
    {
        color: 0xFFFFFF,
        side: THREE.DoubleSide
    }
);
const plane = new THREE.Mesh(planeGeometry, planeMaterial);
// plane.position.set(-60, 10, 0)
scene.add(plane);
plane.rotation.x = -0.5 * Math.PI;
plane.receiveShadow = true;

const gridHelper = new THREE.GridHelper(30);
scene.add(gridHelper);

const sphereGeometry = new THREE.SphereGeometry(3, 25, 25);
const spherexMaterial = new THREE.MeshStandardMaterial(
    { 
        color: 0x0000FF,
        wireframe: false
    }
);
const sphere = new THREE.Mesh(sphereGeometry, spherexMaterial);
scene.add(sphere);
sphere.position.set(-10, 10, 0);
sphere.castShadow = true;

const ambientLight = new THREE.AmbientLight(0x333333);
scene.add(ambientLight);

// const directionalLight = new THREE.DirectionalLight(0xFFFFFF, 0.8);
// scene.add(directionalLight);
// directionalLight.position.set(-30, 50, 0);
// directionalLight.castShadow = true;
// console.log(plane, directionalLight)

// // Static
// //-(boardWidth / 2) × y / √(x² + y²)
// //Dynamic
// // ((P.x - w/2) × L.y + P.y × |L.x|) / √(L.x² + L.y²)
// //Dynamic
// // directionalLight.shadow.camera.bottom = (((plane.position.x - (planeGeometry.parameters.width/2)) * directionalLight.position.y + plane.position.y * Math.abs(directionalLight.position.x))  / Math.sqrt(directionalLight.position.x**2 + directionalLight.position.y**2));
// // directionalLight.shadow.camera.top = ((plane.position.x + planeGeometry.parameters.width / 2) * directionalLight.position.y + plane.position.y * Math.abs(directionalLight.position.x)) / Math.hypot(directionalLight.position.x, directionalLight.position.y) ;
// //Staic
// // directionalLight.shadow.camera.top = (planeGeometry.parameters.width/2) * (directionalLight.position.y / Math.sqrt(directionalLight.position.x**2 + directionalLight.position.y**2))
// directionalLight.shadow.camera.bottom = -12;

// const dLightHelper = new THREE.DirectionalLightHelper(directionalLight);
// scene.add(dLightHelper);

// const dLightShadowHelper = new THREE.CameraHelper(directionalLight.shadow.camera);
// scene.add(dLightShadowHelper);

const spotlight = new THREE.SpotLight(0xFFFFFF);
scene.add(spotlight);
spotlight.position.set(-100, 100, 0);
spotlight.castShadow = true;
spotlight.angle = 0.2;

const sLightHelper = new THREE.SpotLightHelper(spotlight);
scene.add(sLightHelper);

// scene.fog = new THREE.Fog(0xFFFFFF, 0, 200);
scene.fog = new THREE.FogExp2(0xFFFFFF, 0.01);

// renderer.setClearColor(0xFFEA00)

const textureLoader = new THREE.TextureLoader();
const background = textureLoader.load(stars); 
background.colorSpace = THREE.SRGBColorSpace; 
scene.background = background;

const wrapper = textureLoader.load(nebula);
wrapper.colorSpace = THREE.SRGBColorSpace;

const box2Geometry = new THREE.BoxGeometry(4, 4, 4);
const box2Material = new THREE.MeshBasicMaterial(
    {
        // color: 0x00FF00,
        // map: wrapper
        
    }
);
const box2 = new THREE.Mesh(box2Geometry, box2Material);
scene.add(box2);
box2.position.set(0, 15, 10);
box2.material.map = wrapper;

const gui = new dat.GUI();

const options = {
    sphereColor: '#ffea00',
    wireframe: false,
    speed: 0.01,
    angle: 0.2,
    penumbra: 0,
    intensity: 1,
}

gui.addColor(options, 'sphereColor').onChange(function(e) {
    sphere.material.color.set(e);
}) 

gui.add(options, 'wireframe').onChange(function(e) {
    sphere.material.wireframe = e;
});

gui.add(options, 'speed', 0, 0.1);

gui.add(options, 'angle', 0, 1);
gui.add(options, 'penumbra', 0, 1);
gui.add(options, 'intensity', 0, 100000);

let step = 0;
// let speed = 0.01;

function animate(time) {
    box.rotation.x = time / 1000;
    box.rotation.y = time / 1000;

    step+=options.speed;
    sphere.position.y = 10 * Math.abs(Math.sin(step));

    spotlight.angle = options.angle;
    spotlight.penumbra = options.penumbra;
    spotlight.intensity = options.intensity;
    sLightHelper.update();

    renderer.render(scene, camera);
}

renderer.setAnimationLoop(animate);

