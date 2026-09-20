import * as THREE from 'three';
import { City } from './city/City.js';
import { Character } from './character/Character.js';
import { CameraController } from './camera/CameraController.js';
import { InputManager } from './input/InputManager.js';
import { resolveCircleVsBoxes } from './collision/Collision.js';
import { MuseumLoader } from './museum/MuseumLoader.js';

const app = document.getElementById('app');

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, 50, 150);
// Low-level fill so unlit faces (mostly indoors, facing away from the sun)
// never go pure black; subtle enough not to wash out the city's shadows.
scene.add(new THREE.AmbientLight(0xffffff, 0.25));

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 300);

const city = new City(scene);
const character = new Character(scene);
const input = new InputManager(renderer.domElement);
const cameraController = new CameraController(camera, input, character.group);
cameraController.setOccluders(city.occluderMeshes);

const museumLoader = new MuseumLoader(scene);

const statusPrompt = document.getElementById('interact-prompt');

// Simple city <-> museum interior state machine. Museum interiors are built
// once (lazily, on first entry) and parked at their own world-space offset;
// entering/exiting just toggles which root group is visible and which
// collider/occluder lists are active, rather than swapping scenes.
let placeState = 'city'; // 'city' | 'museum'
let activeMuseum = null;
let isTransitioning = false;
let transitionCooldown = 0; // seconds left before entrance/exit triggers are checked again

const moveDir = new THREE.Vector3();
const forward = new THREE.Vector3();
const right = new THREE.Vector3();

const clock = new THREE.Clock();

async function enterMuseum(layoutId) {
  isTransitioning = true;
  statusPrompt.classList.remove('hidden');
  statusPrompt.textContent = 'Entering the Ateneum...';

  try {
    const instance = await museumLoader.load(layoutId);
    activeMuseum = instance;
    city.group.visible = false;
    instance.group.visible = true;
    character.setPositionXZ(instance.spawnPointWorld.x, instance.spawnPointWorld.z);
    if (typeof instance.layout.entrance.spawnFacingDeg === 'number') {
      character.setFacingDeg(instance.layout.entrance.spawnFacingDeg);
    }
    cameraController.setOccluders(instance.occluderMeshes);
    placeState = 'museum';
    transitionCooldown = 0.5;
  } catch (error) {
    console.error(error);
    statusPrompt.textContent = `Could not load museum: ${error.message}`;
    setTimeout(() => statusPrompt.classList.add('hidden'), 3000);
  } finally {
    isTransitioning = false;
    if (placeState === 'museum') statusPrompt.classList.add('hidden');
  }
}

function exitMuseum() {
  activeMuseum.group.visible = false;
  city.group.visible = true;
  const e = city.museumEntrance;
  character.setPositionXZ(e.x, e.z + e.triggerDepth + 1);
  cameraController.setOccluders(city.occluderMeshes);
  placeState = 'city';
  activeMuseum = null;
  transitionCooldown = 0.5;
}

function animate() {
  const dt = Math.min(clock.getDelta(), 0.1);
  transitionCooldown = Math.max(0, transitionCooldown - dt);

  const axis = input.getMoveAxis();
  cameraController.getForward(forward);
  cameraController.getRight(right);

  moveDir.set(0, 0, 0);
  moveDir.addScaledVector(forward, -axis.z);
  moveDir.addScaledVector(right, axis.x);

  character.move({ x: moveDir.x, z: moveDir.z }, dt);

  const activeColliders = placeState === 'city' ? city.colliders : activeMuseum.colliders;
  const resolved = resolveCircleVsBoxes(
    { x: character.position.x, z: character.position.z },
    character.radius,
    activeColliders,
  );
  character.setPositionXZ(resolved.x, resolved.z);

  cameraController.update(dt);

  if (!isTransitioning && transitionCooldown <= 0) {
    if (placeState === 'city' && city.isAtMuseumEntrance(character.position.x, character.position.z)) {
      enterMuseum(city.museumEntrance.layoutId);
    } else if (placeState === 'museum' && activeMuseum.isNearEntranceDoor(character.position.x, character.position.z, 1.2)) {
      exitMuseum();
    }
  }

  input.resetFrameDeltas();

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

requestAnimationFrame(animate);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
