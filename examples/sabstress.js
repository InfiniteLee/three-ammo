import AmmoWorker from "../src/ammo.worker";
import "three";
import { AmmoDebugConstants, DefaultBufferSize } from "ammo-debug-drawer";
import { WorkerHelpers, CONSTANTS } from "../index";
const MESSAGE_TYPES = CONSTANTS.MESSAGE_TYPES,
  TYPE = CONSTANTS.TYPE,
  FIT = CONSTANTS.FIT,
  BUFFER_CONFIG = CONSTANTS.BUFFER_CONFIG,
  BUFFER_STATE = CONSTANTS.BUFFER_STATE,
  SHAPE = CONSTANTS.SHAPE;
import Stats from "stats.js";

const stats = new Stats();
stats.showPanel(0);
document.body.appendChild(stats.dom);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.z = 10;

const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const uuids = [];
const indexes = {};

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

const ammoWorker = new AmmoWorker();

const workerHelpers = new WorkerHelpers(ammoWorker);

const sharedArrayBuffer = new SharedArrayBuffer(
  4 * BUFFER_CONFIG.HEADER_LENGTH + //header
  4 * BUFFER_CONFIG.BODY_DATA_SIZE * BUFFER_CONFIG.MAX_BODIES + //matrices
    4 * BUFFER_CONFIG.MAX_BODIES //velocities
);
const headerIntArray = new Int32Array(sharedArrayBuffer, 0, BUFFER_CONFIG.HEADER_LENGTH * 4);
const objectMatricesIntArray = new Uint32Array(sharedArrayBuffer, BUFFER_CONFIG.HEADER_LENGTH * 4);
const objectMatricesFloatArray = new Float32Array(sharedArrayBuffer, BUFFER_CONFIG.HEADER_LENGTH * 4);
objectMatricesIntArray[0] = BUFFER_STATE.UNINITIALIZED;

/* DEBUG RENDERING */
const debugSharedArrayBuffer = new SharedArrayBuffer(4 + 2 * DefaultBufferSize * 4);
const debugIndex = new Uint32Array(debugSharedArrayBuffer, 0, 4);
const debugVertices = new Float32Array(debugSharedArrayBuffer, 4, DefaultBufferSize);
const debugColors = new Float32Array(debugSharedArrayBuffer, 4 + DefaultBufferSize, DefaultBufferSize);
const debugGeometry = new THREE.BufferGeometry();
debugGeometry.setAttribute("position", new THREE.BufferAttribute(debugVertices, 3));
debugGeometry.setAttribute("color", new THREE.BufferAttribute(debugColors, 3));
const debugMaterial = new THREE.LineBasicMaterial({
  vertexColors: THREE.VertexColors,
  depthTest: true
});
const debugMesh = new THREE.LineSegments(debugGeometry, debugMaterial);
debugMesh.frustumCulled = false;
debugMesh.renderOrder = 999;
scene.add(debugMesh);

ammoWorker.postMessage({
  type: MESSAGE_TYPES.INIT,
  worldConfig: { debugDrawMode: AmmoDebugConstants.DrawWireframe },
  sharedArrayBuffer
});
ammoWorker.onmessage = async event => {
  if (event.data.type === MESSAGE_TYPES.READY) {
    // workerHelpers.enableDebug(true, debugSharedArrayBuffer);

    workerHelpers.addBody("floor", floorMesh, { type: TYPE.STATIC });
    workerHelpers.addShapes("floor", "floorShape", floorMesh, { type: SHAPE.BOX });

    for (let i = 0; i < ballCount; i++) {
      const matrix = new THREE.Matrix4();
      ballMesh.getMatrixAt(i, matrix);
      ammoWorker.postMessage({
        type: MESSAGE_TYPES.ADD_BODY,
        uuid: i,
        matrix: matrix.elements,
        options: { type: TYPE.DYNAMIC, gravity: { x: 0, y: -9.8, z: 0 } }
      });
      ammoWorker.postMessage({
        type: MESSAGE_TYPES.ADD_SHAPES,
        bodyUuid: i,
        shapesUuid: i,
        matrixWorld: matrix.elements,
        options: { type: SHAPE.SPHERE, fit: FIT.MANUAL, sphereRadius: 0.25 }
      });
    }
  } else if (event.data.type === MESSAGE_TYPES.BODY_READY) {
    const uuid = event.data.uuid;
    uuids.push(uuid);
    indexes[uuid] = event.data.index;
  }
};

let lastTick = 0;
const matrix = new THREE.Matrix4();
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
    direction = -1;
  } else if (x <= -1.5) {
    direction = 1;
  }

  if (Atomics.load(headerIntArray, 0) === BUFFER_STATE.READY) {
    for (let i = 0; i < uuids.length; i++) {
      const uuid = uuids[i];
      if (uuid === "floor") {
        objectMatricesFloatArray.set(floorMesh.matrixWorld.elements, indexes[uuid] * BUFFER_CONFIG.BODY_DATA_SIZE);
      } else {
        matrix.fromArray(objectMatricesFloatArray, indexes[uuid] * BUFFER_CONFIG.BODY_DATA_SIZE);
        matrix.decompose(pos, quat, scale);
        if (pos.y < -2) {
          matrix.setPosition(Math.random() * 10 - 5, Math.random() * 4 + 1, Math.random() * 10 - 5);
          objectMatricesFloatArray.set(matrix.elements, indexes[uuid] * BUFFER_CONFIG.BODY_DATA_SIZE);
          workerHelpers.resetDynamicBody(uuid, {});
        }
        ballMesh.setMatrixAt(uuid, matrix);
      }
      ballMesh.instanceMatrix.needsUpdate = true;
    }
    Atomics.store(headerIntArray, 0, BUFFER_STATE.CONSUMED);
  }

  /* DEBUG RENDERING */
  const index = Atomics.load(debugIndex, 0);
  if (index !== 0) {
    debugGeometry.attributes.position.needsUpdate = true;
    debugGeometry.attributes.color.needsUpdate = true;
  }
  debugGeometry.setDrawRange(0, index);
  Atomics.store(debugIndex, 0, 0);

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
