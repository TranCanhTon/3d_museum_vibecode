import * as THREE from 'three';
import { City } from './city/City.js';
import { Character } from './character/Character.js';
import { CameraController } from './camera/CameraController.js';
import { InputManager } from './input/InputManager.js';
import { resolveCircleVsBoxes } from './collision/Collision.js';
import { MuseumLoader } from './museum/MuseumLoader.js';
import { findFocusedArtwork, pickArtworkAtClient } from './interaction/ArtworkInteraction.js';
import { ArtworkOverlay } from './ui/ArtworkOverlay.js';

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
const overlay = new ArtworkOverlay();

const statusPrompt = document.getElementById('interact-prompt');

// Simple city <-> museum interior state machine. Museum interiors are built
// once (lazily, on first entry) and parked at their own world-space offset;
// entering/exiting just toggles which root group is visible and which
// collider/occluder lists are active, rather than swapping scenes.
let placeState = 'city'; // 'city' | 'museum'
let activeMuseum = null;
let isTransitioning = false;
let transitionCooldown = 0; // seconds left before entrance/exit triggers are checked again
let focusedArtwork = null; // the artwork interaction record the player is currently near+facing, if any

// The wall canvas currently mid-transition between its sketch render and
// the real photo (see SketchMaterial's uReveal uniform), and which way.
let revealMaterial = null;
let revealDirection = 0;
const REVEAL_SPEED = 2.5; // uReveal units/second

let wasInteractKeyDown = false;

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
  focusedArtwork = null;
  transitionCooldown = 0.5;
}

/** Starts (or reverses) the sketch<->real crossfade on an artwork's canvas. */
function setRevealTarget(artworkInteraction, revealed) {
  if (!artworkInteraction?.sketchMaterial) return;
  revealMaterial = artworkInteraction.sketchMaterial;
  revealDirection = revealed ? 1 : -1;
}

function openArtwork(artworkInteraction) {
  overlay.open(artworkInteraction.artwork);
  setRevealTarget(artworkInteraction, true);
}

overlay.onClose(() => {
  if (revealMaterial) setRevealTarget({ sketchMaterial: revealMaterial }, false);
});

renderer.domElement.addEventListener('click', (event) => {
  if (placeState !== 'museum' || overlay.isOpen || !activeMuseum) return;
  const hit = pickArtworkAtClient(event.clientX, event.clientY, renderer.domElement, camera, activeMuseum.artworks);
  if (!hit) return;
  const dx = character.position.x - hit.worldPosition.x;
  const dz = character.position.z - hit.worldPosition.z;
  if (Math.hypot(dx, dz) < 2.2) openArtwork(hit);
});

function animate() {
  const dt = Math.min(clock.getDelta(), 0.1);
  transitionCooldown = Math.max(0, transitionCooldown - dt);

  if (revealMaterial) {
    const u = revealMaterial.uniforms.uReveal;
    u.value = THREE.MathUtils.clamp(u.value + revealDirection * REVEAL_SPEED * dt, 0, 1);
    if ((revealDirection > 0 && u.value >= 1) || (revealDirection < 0 && u.value <= 0)) {
      revealMaterial = null;
    }
  }

  const uiBlocksMovement = overlay.isOpen;

  if (!uiBlocksMovement) {
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
  } else {
    character.move({ x: 0, z: 0 }, dt);
  }

  cameraController.update(dt);

  if (!isTransitioning && transitionCooldown <= 0 && !uiBlocksMovement) {
    if (placeState === 'city' && city.isAtMuseumEntrance(character.position.x, character.position.z)) {
      enterMuseum(city.museumEntrance.layoutId);
    } else if (placeState === 'museum' && activeMuseum.isNearEntranceDoor(character.position.x, character.position.z, 1.2)) {
      exitMuseum();
    }
  }

  if (placeState === 'museum' && activeMuseum && !uiBlocksMovement) {
    focusedArtwork = findFocusedArtwork(
      { x: character.position.x, z: character.position.z },
      character.getForwardXZ(),
      activeMuseum.artworks,
    );
    if (focusedArtwork) {
      statusPrompt.classList.remove('hidden');
      statusPrompt.textContent = 'Press E to view';
    } else if (statusPrompt.textContent === 'Press E to view') {
      statusPrompt.classList.add('hidden');
    }
  } else if (placeState === 'city' && statusPrompt.textContent === 'Press E to view') {
    statusPrompt.classList.add('hidden');
  }

  const interactKeyDown = input.isPressed('KeyE');
  if (interactKeyDown && !wasInteractKeyDown) {
    if (overlay.isOpen) {
      overlay.close();
    } else if (focusedArtwork) {
      openArtwork(focusedArtwork);
    }
  }
  wasInteractKeyDown = interactKeyDown;

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
