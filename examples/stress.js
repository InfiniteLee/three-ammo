import { CONSTANTS } from "../index.js";
import World from "../src/world";
import Body from "../src/body";
const TYPE = CONSTANTS.TYPE,
  FIT = CONSTANTS.FIT;
import { createBoxShape, createSphereShape, iterateGeometries } from "three-to-ammo";
import { AmmoDebugConstants, DefaultBufferSize } from "ammo-debug-drawer";
import Stats from "stats.js";

import Ammo from "ammo.js/builds/ammo.wasm.js";
import AmmoWasm from "ammo.js/builds/ammo.wasm.wasm";
const AmmoModule = Ammo.bind(undefined, {
  locateFile(path) {
    if (path.endsWith(".wasm")) {
      return AmmoWasm;
    }
    return path;
  }
});

const stats = new Stats();
stats.showPanel(0);
document.body.appendChild(stats.dom);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.z = 10;

const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const bodies = {};
const meshMatrices = {};

const floorGeometry = new THREE.BoxBufferGeometry(10, 0.1, 10);
const floorMaterial = new THREE.MeshBasicMaterial({ color: 0xff6600 });
const floorMesh = new THREE.Mesh(floorGeometry, floorMaterial);
floorMesh.position.set(0, -1, 0);
scene.add(floorMesh);

const BoxGeometry = new THREE.BoxBufferGeometry(0.5, 0.5, 0.5);
const boxMaterial = new THREE.MeshBasicMaterial({ color: 0x00ffff });
const boxMesh = new THREE.Mesh(BoxGeometry, boxMaterial);
scene.add(boxMesh);

const urlParams = new URLSearchParams(window.location.search);
const count = urlParams.get("count");
const ballCount = count ? parseInt(count) : 1000;
document.getElementById("info").innerHTML += ` (${count} Bodies)`;

const ballGeometry = new THREE.SphereBufferGeometry(0.25, 32, 32);
const ballMaterial = new THREE.MeshNormalMaterial();
const ballMesh = new THREE.InstancedMesh(ballGeometry, ballMaterial, ballCount);
scene.add(ballMesh);

const ballMatrix = new THREE.Matrix4();
let i = 0;
const offset = (10 - 1) / 2;
for (let x = 0; x < 10; x++) {
  for (let y = 0; y < ballCount / 100; y++) {
    for (let z = 0; z < 10; z++) {
      ballMatrix.identity();
      ballMatrix.setPosition(offset - x + Math.random() * 0.1, y, offset - z + Math.random() * 0.1);
      ballMesh.setMatrixAt(i++, ballMatrix);
    }
  }
}

const debugVertices = new Float32Array(DefaultBufferSize);
const debugColors = new Float32Array(DefaultBufferSize);
const debugGeometry = new THREE.BufferGeometry();
debugGeometry.addAttribute("position", new THREE.BufferAttribute(debugVertices, 3).setDynamic(true));
debugGeometry.addAttribute("color", new THREE.BufferAttribute(debugColors, 3).setDynamic(true));
const debugMaterial = new THREE.LineBasicMaterial({ vertexColors: THREE.VertexColors });
const debugMesh = new THREE.LineSegments(debugGeometry, debugMaterial);
debugMesh.frustumCulled = false;
scene.add(debugMesh);

const createBody = (options, mesh, world) => {
  mesh.updateMatrixWorld();
  const matrixWorld = new THREE.Matrix4();
  matrixWorld.copy(mesh.matrixWorld);
  const body = new Body(options, matrixWorld, world);
  bodies[mesh.uuid] = body;
  return body;
};

AmmoModule().then(Ammo => {
  const world = new World({ debugDrawMode: AmmoDebugConstants.DrawWireframe });
  // world.getDebugDrawer(null, debugVertices, debugColors).enable();

  const vertices = [];
  const matrices = [];

  const floorBody = createBody({ type: TYPE.STATIC }, floorMesh, world);
  iterateGeometries(floorMesh, {}, (vertexArray, matrix) => {
    vertices.push(vertexArray);
    matrices.push(matrix);
  });
  const floorShape = createBoxShape(vertices, matrices, floorMesh.matrixWorld.elements, {});
  floorBody.addShape(floorShape);

  for (let i = 0; i < ballCount; i++) {
    const matrix = new THREE.Matrix4();
    ballMesh.getMatrixAt(i, matrix);
    const ballBody = new Body({ type: TYPE.DYNAMIC, gravity: { x: 0, y: -9.8, z: 0 } }, matrix, world);
    bodies[i] = ballBody;
    meshMatrices[i] = matrix;
    const ballShape = createSphereShape(null, null, matrix.elements, { fit: FIT.MANUAL, sphereRadius: 0.25 });
    ballBody.addShape(ballShape);
  }

  let lastTick = 0;
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  let direction = 1;

  const tick = function(t) {
    requestAnimationFrame(tick);
    stats.begin();
    const dt = t - lastTick;
    lastTick = t;

    const x = boxMesh.position.x + (direction * 3 * dt) / 1000;
    boxMesh.position.set(x, 1, 7);
    if (x >= 1.5) {
      direction = -1.5;
    } else if (x <= -1) {
      direction = 1;
    }

    world.step(dt / 1000);
    for (let i = 0; i < ballCount; i++) {
      if (bodies[i].type === TYPE.DYNAMIC) {
        bodies[i].syncFromPhysics();
        meshMatrices[i].decompose(pos, quat, scale);
        if (pos.y < -2) {
          meshMatrices[i].setPosition(Math.random() * 10 - 5, Math.random() * 4 + 1, Math.random() * 10 - 5);
          bodies[i].syncToPhysics(true);
          bodies[i].physicsBody.getLinearVelocity().setValue(0, 0, 0);
          bodies[i].physicsBody.getAngularVelocity().setValue(0, 0, 0);
        }
        ballMesh.setMatrixAt(i, meshMatrices[i]);
      }
    }
    ballMesh.instanceMatrix.needsUpdate = true;

    if (world.debugDrawer) {
      if (world.debugDrawer.index !== 0) {
        debugGeometry.attributes.position.needsUpdate = true;
        debugGeometry.attributes.color.needsUpdate = true;
      }

      debugGeometry.setDrawRange(0, world.debugDrawer.index);
    }

    renderer.render(scene, camera);
    stats.end();
  };

  requestAnimationFrame(tick);

  window.addEventListener("resize", onWindowResize, false);

  function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
});
