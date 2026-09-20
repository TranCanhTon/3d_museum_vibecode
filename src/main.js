import * as THREE from 'three';
import { City } from './city/City.js';
import { Character } from './character/Character.js';
import { CameraController } from './camera/CameraController.js';
import { InputManager } from './input/InputManager.js';
import { resolveCircleVsBoxes } from './collision/Collision.js';

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
scene.fog = new THREE.Fog(0x87ceeb, 40, 110);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 300);

const city = new City(scene);
const character = new Character(scene);
const input = new InputManager(renderer.domElement);
const cameraController = new CameraController(camera, input, character.group);
cameraController.setOccluders(city.occluderMeshes);

const entrancePrompt = document.getElementById('interact-prompt');

const moveDir = new THREE.Vector3();
const forward = new THREE.Vector3();
const right = new THREE.Vector3();

const clock = new THREE.Clock();

function animate() {
  const dt = Math.min(clock.getDelta(), 0.1);

  const axis = input.getMoveAxis();
  cameraController.getForward(forward);
  cameraController.getRight(right);

  moveDir.set(0, 0, 0);
  moveDir.addScaledVector(forward, -axis.z);
  moveDir.addScaledVector(right, axis.x);

  character.move({ x: moveDir.x, z: moveDir.z }, dt);

  const resolved = resolveCircleVsBoxes(
    { x: character.position.x, z: character.position.z },
    character.radius,
    city.colliders,
  );
  character.setPositionXZ(resolved.x, resolved.z);

  cameraController.update(dt);

  const atEntrance = city.isAtMuseumEntrance(character.position.x, character.position.z);
  entrancePrompt.classList.toggle('hidden', !atEntrance);
  if (atEntrance) {
    entrancePrompt.textContent = 'Walking into the Ateneum... (museum interior coming in stage 2)';
  } else {
    entrancePrompt.textContent = 'Press E to view';
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
