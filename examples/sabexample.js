import "three";
import { AmmoDebugConstants, DefaultBufferSize } from "ammo-debug-drawer";
import { AmmoWorker, WorkerHelpers, CONSTANTS } from "../index";
const MESSAGE_TYPES = CONSTANTS.MESSAGE_TYPES,
  TYPE = CONSTANTS.TYPE,
  BUFFER_CONFIG = CONSTANTS.BUFFER_CONFIG,
  BUFFER_STATE = CONSTANTS.BUFFER_STATE,
  SHAPE = CONSTANTS.SHAPE;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.z = 5;

const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const uuids = [];
const object3Ds = {};
const uuidToIndex = {};
const IndexToUuid = {};
const bodyOptions = {};
const shapes = {};

const floorGeometry = new THREE.BoxBufferGeometry(5, 0.1, 5);
const floorMaterial = new THREE.MeshBasicMaterial({ color: 0xff6600 });
const floorMesh = new THREE.Mesh(floorGeometry, floorMaterial);
floorMesh.position.set(0, -1, 0);
scene.add(floorMesh);
object3Ds["floor"] = floorMesh;

const boxGeometry = new THREE.BoxBufferGeometry(0.5, 0.5, 0.5);
const boxMaterial = new THREE.MeshBasicMaterial({ color: 0x00ffff });
const boxMesh = new THREE.Mesh(boxGeometry, boxMaterial);
boxMesh.position.set(-1, 2, 0);
scene.add(boxMesh);
object3Ds["box"] = boxMesh;

const ballGeometry = new THREE.SphereBufferGeometry(0.5, 32, 32);
const ballMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
const ballMesh = new THREE.Mesh(ballGeometry, ballMaterial);
ballMesh.position.set(0, 2, 0);
scene.add(ballMesh);
object3Ds["ball"] = ballMesh;

// const boxGeometry2 = new THREE.BoxBufferGeometry(0.5, 0.5, 0.5);
// const boxMaterial2 = new THREE.MeshBasicMaterial({ color: 0x00ffff });
// const boxMesh2 = new THREE.Mesh(boxGeometry2, boxMaterial2);
// boxMesh2.position.set(1, 2, 0);
// scene.add(boxMesh2);
// object3Ds[boxMesh2.uuid] = boxMesh2;

// const boxGeometry3 = new THREE.BoxBufferGeometry(0.5, 0.5, 0.5);
// const boxMaterial3 = new THREE.MeshBasicMaterial({ color: 0x00ffff });
// const boxMesh3 = new THREE.Mesh(boxGeometry3, boxMaterial3);
// boxMesh3.position.set(1, 3, 0);
// scene.add(boxMesh3);
// object3Ds[boxMesh3.uuid] = boxMesh3;

const ammoWorker = new AmmoWorker();

const workerHelpers = new WorkerHelpers(ammoWorker);

const sharedArrayBuffer = new SharedArrayBuffer(
  4 * BUFFER_CONFIG.HEADER_LENGTH + //header
  4 * BUFFER_CONFIG.BODY_DATA_SIZE * BUFFER_CONFIG.MAX_BODIES + //matrices
    4 * BUFFER_CONFIG.MAX_BODIES //velocities
);
const headerIntArray = new Int32Array(sharedArrayBuffer, 0, BUFFER_CONFIG.HEADER_LENGTH);
const objectMatricesIntArray = new Int32Array(
  sharedArrayBuffer,
  BUFFER_CONFIG.HEADER_LENGTH * 4,
  BUFFER_CONFIG.BODY_DATA_SIZE * BUFFER_CONFIG.MAX_BODIES
);
const objectMatricesFloatArray = new Float32Array(
  sharedArrayBuffer,
  BUFFER_CONFIG.HEADER_LENGTH * 4,
  BUFFER_CONFIG.BODY_DATA_SIZE * BUFFER_CONFIG.MAX_BODIES
);

objectMatricesIntArray[0] = BUFFER_STATE.UNINITIALIZED;

/* DEBUG RENDERING */
const debugSharedArrayBuffer = new SharedArrayBuffer(4 + 2 * DefaultBufferSize * 4);
const debugIndex = new Uint32Array(debugSharedArrayBuffer, 0, 4);
const debugVertices = new Float32Array(debugSharedArrayBuffer, 4, DefaultBufferSize);
const debugColors = new Float32Array(debugSharedArrayBuffer, 4 + DefaultBufferSize, DefaultBufferSize);
const debugGeometry = new THREE.BufferGeometry();
debugGeometry.addAttribute("position", new THREE.BufferAttribute(debugVertices, 3).setDynamic(true));
debugGeometry.addAttribute("color", new THREE.BufferAttribute(debugColors, 3).setDynamic(true));
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
    workerHelpers.enableDebug(true, debugSharedArrayBuffer);

    bodyOptions["box"] = { type: TYPE.DYNAMIC, gravity: { x: 0, y: 0, z: 0 } };
    workerHelpers.addBody("box", boxMesh, bodyOptions["box"]);
    workerHelpers.addShapes("box", "box-shape", boxMesh, { type: SHAPE.BOX });
    shapes["box"] = "box-shape";

    bodyOptions["floor"] = { type: TYPE.KINEMATIC };
    workerHelpers.addBody("floor", floorMesh, bodyOptions["floor"]);
    workerHelpers.addShapes("floor", "floor-shape", floorMesh, { type: SHAPE.BOX });
    shapes["floor"] = "floor-shape";

    bodyOptions["ball"] = { gravity: { x: 0, y: 0, z: 0 } };
    workerHelpers.addBody("ball", ballMesh, bodyOptions["ball"]);
    workerHelpers.addShapes("ball", "ball-shape", ballMesh, { type: SHAPE.SPHERE });
    shapes["ball"] = "ball-shape";

    workerHelpers.addConstraint("constraint", "ball", "box");

    // bodyOptions[boxMesh2.uuid] = { type: TYPE.DYNAMIC, gravity: { x: 0, y: -1, z: 0 } };
    // workerHelpers.addBody(boxMesh2, bodyOptions[boxMesh2.uuid]);
    // workerHelpers.addShapes(boxMesh2.uuid, boxMesh2, { type: SHAPE.BOX });

    window.setTimeout(() => {
      const ballOptions = bodyOptions["ball"];
      ballOptions.gravity.y = -9.8;
      workerHelpers.updateBody("ball", ballOptions);

      window.setInterval(() => {
        if (ballOptions.type === TYPE.DYNAMIC) {
          ballOptions.type = TYPE.KINEMATIC;
          workerHelpers.updateBody("ball", ballOptions);
          ballMesh.position.set(0, 2, 0);
        } else {
          ballOptions.type = TYPE.DYNAMIC;
          workerHelpers.updateBody("ball", ballOptions);
        }
      }, 2000);
    }, 1000);

    // window.setTimeout(() => {
    //   workerHelpers.removeBody(boxMesh2.uuid);
    //   uuids.splice(uuids.indexOf(boxMesh2.uuid), 1);
    //   delete shapes[boxMesh2.uuid];

    //   bodyOptions[boxMesh3.uuid] = { type: TYPE.DYNAMIC, gravity: { x: 0, y: -1, z: 0 } };
    //   workerHelpers.addBody(boxMesh3, bodyOptions[boxMesh3.uuid]);
    //   workerHelpers.addShapes(boxMesh3.uuid, boxMesh3, { type: SHAPE.BOX });
    // }, 5000);

    // window.setTimeout(() => {
    //   /* remove constraint example */
    //   workerHelpers.removeConstraint("constraint");

    //   /* remove body example */
    //   workerHelpers.removeBody(boxMesh.uuid);
    //   uuids.splice(uuids.indexOf(boxMesh.uuid), 1);
    //   delete shapes[boxMesh.uuid];

    //   /* remove shape example */
    //   workerHelpers.removeShapes(ballMesh.uuid, shapes[ballMesh.uuid]);
    //   shapes[ballMesh.uuid].length = 0;
    // }, 3000);
  } else if (event.data.type === MESSAGE_TYPES.BODY_READY) {
    const uuid = event.data.uuid;
    uuids.push(uuid);
    uuidToIndex[uuid] = event.data.index;
    IndexToUuid[event.data.index] = uuid;
  }
};

const transform = new THREE.Matrix4();
const inverse = new THREE.Matrix4();
const matrix = new THREE.Matrix4();
const scale = new THREE.Vector3();

const tick = function() {
  requestAnimationFrame(tick);

  floorMesh.rotation.y += 0.01;

  if (Atomics.load(headerIntArray, 0) === BUFFER_STATE.READY) {
    for (let i = 0; i < uuids.length; i++) {
      const uuid = uuids[i];
      const type = bodyOptions[uuid].type ? bodyOptions[uuid].type : TYPE.DYNAMIC;
      const object3D = object3Ds[uuid];
      if (type === TYPE.DYNAMIC) {
        matrix.fromArray(objectMatricesFloatArray, uuidToIndex[uuid] * BUFFER_CONFIG.BODY_DATA_SIZE);
        inverse.getInverse(object3D.parent.matrixWorld);
        transform.multiplyMatrices(inverse, matrix);
        transform.decompose(object3D.position, object3D.quaternion, scale);
      } else {
        objectMatricesFloatArray.set(object3D.matrixWorld.elements, uuidToIndex[uuid] * BUFFER_CONFIG.BODY_DATA_SIZE);
      }

      // print velocities
      // console.log(
      //   uuid,
      //   objectMatricesFloatArray[indexes[uuid] * BUFFER_CONFIG.BODY_DATA_SIZE + 16],
      //   objectMatricesFloatArray[indexes[uuid] * BUFFER_CONFIG.BODY_DATA_SIZE + 17]
      // );

      // print coliisions
      // const collisions = [];
      // for (let j = 18; j < 26; j++) {
      //   const collidingIndex = objectMatricesIntArray[uuidToIndex[uuid] * BUFFER_CONFIG.BODY_DATA_SIZE + j];
      //   if (collidingIndex !== -1) {
      //     collisions.push(IndexToUuid[collidingIndex]);
      //   }
      // }
      // console.log(uuid, collisions);
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
};

requestAnimationFrame(tick);

window.addEventListener("resize", onWindowResize, false);

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
