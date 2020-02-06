import { World, Body, Constraint, CONSTANTS } from "../index.js";
const TYPE = CONSTANTS.TYPE,
  CONSTRAINT = CONSTANTS.CONSTRAINT,
  ACTIVATION_STATE = CONSTANTS.ACTIVATION_STATE;
import { createBoxShape, createSphereShape, iterateGeometries } from "three-to-ammo";
import { AmmoDebugConstants, DefaultBufferSize } from "ammo-debug-drawer";

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

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.z = 5;

const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const uuids = [];
const bodies = {};
const meshes = {};
const meshMatrices = {};

const floorGeometry = new THREE.BoxBufferGeometry(5, 0.1, 5);
const floorMaterial = new THREE.MeshBasicMaterial({ color: 0xff6600 });
const floorMesh = new THREE.Mesh(floorGeometry, floorMaterial);
floorMesh.position.set(0, -1, 0);
scene.add(floorMesh);

const ballGeometry = new THREE.SphereBufferGeometry(0.5, 32, 32);
const ballMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
const ballMesh = new THREE.Mesh(ballGeometry, ballMaterial);
ballMesh.position.set(0, 2, 0);
scene.add(ballMesh);

const boxGeometry = new THREE.BoxBufferGeometry(0.5, 0.5, 0.5);
const boxMaterial = new THREE.MeshBasicMaterial({ color: 0x00ffff });
const boxMesh = new THREE.Mesh(boxGeometry, boxMaterial);
boxMesh.position.set(-1, 2, 0);
scene.add(boxMesh);

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
  uuids.push(mesh.uuid);
  meshes[mesh.uuid] = mesh;
  meshMatrices[mesh.uuid] = matrixWorld;
  const body = new Body(options, matrixWorld, world);
  bodies[mesh.uuid] = body;
  return body;
};

AmmoModule().then(Ammo => {
  const world = new World({ debugDrawMode: AmmoDebugConstants.DrawWireframe });
  world.getDebugDrawer(null, debugVertices, debugColors).enable();

  const vertices = [];
  const matrices = [];

  const floorBody = createBody({ type: TYPE.KINEMATIC }, floorMesh, world);
  iterateGeometries(floorMesh, {}, (vertexArray, matrix) => {
    vertices.push(vertexArray);
    matrices.push(matrix);
  });
  const floorShape = createBoxShape(vertices, matrices, floorMesh.matrixWorld.elements, {});
  floorBody.addShape(floorShape);

  vertices.length = 0;
  matrices.length = 0;

  const ballBody = createBody({ type: TYPE.DYNAMIC, gravity: { x: 0, y: 0, z: 0 } }, ballMesh, world);
  iterateGeometries(ballMesh, {}, (vertexArray, matrix) => {
    vertices.push(vertexArray);
    matrices.push(matrix);
  });
  const ballShape = createSphereShape(vertices, matrices, ballMesh.matrixWorld.elements, {});
  ballBody.addShape(ballShape);

  vertices.length = 0;
  matrices.length = 0;

  const boxBody = createBody(
    { type: TYPE.DYNAMIC, gravity: { x: 0, y: 0, z: 0 }, activationState: ACTIVATION_STATE.DISABLE_DEACTIVATION },
    boxMesh,
    world
  );
  iterateGeometries(boxMesh, {}, (vertexArray, matrix) => {
    vertices.push(vertexArray);
    matrices.push(matrix);
  });
  const boxShape = createBoxShape(vertices, matrices, ballMesh.matrixWorld.elements, {});
  boxBody.addShape(boxShape);

  const constraint = new Constraint({ type: CONSTRAINT.LOCK }, ballBody, boxBody, world);

  window.setTimeout(() => {
    ballBody.update({ gravity: { x: 0, y: -9.8, z: 0 } });
    ballBody.physicsBody.activate(true);

    window.setInterval(() => {
      if (ballBody.type === TYPE.DYNAMIC) {
        ballBody.update({ type: TYPE.KINEMATIC });
        ballMesh.position.set(0, 2, 0);
      } else {
        ballBody.update({ type: TYPE.DYNAMIC });
        ballBody.physicsBody.activate(true);
      }
    }, 2000);
  }, 1000);

  let lastTick = 0;
  const inverse = new THREE.Matrix4();
  const transform = new THREE.Matrix4();
  const scale = new THREE.Vector3();

  const tick = function(t) {
    requestAnimationFrame(tick);
    const dt = t - lastTick;
    lastTick = t;

    floorMesh.rotation.y += 0.01;

    for (let i = 0; i < uuids.length; i++) {
      const uuid = uuids[i];
      const body = bodies[uuid];
      const mesh = meshes[uuid];
      if (body.type === TYPE.KINEMATIC) {
        meshMatrices[uuid].copy(mesh.matrixWorld);
        body.syncToPhysics();
      }
    }
    world.step(dt / 1000);
    for (let i = 0; i < uuids.length; i++) {
      const uuid = uuids[i];
      const body = bodies[uuid];
      const mesh = meshes[uuid];
      if (body.type === TYPE.DYNAMIC) {
        body.syncFromPhysics();
        inverse.getInverse(mesh.parent.matrixWorld);
        transform.multiplyMatrices(inverse, meshMatrices[uuid]);
        transform.decompose(mesh.position, mesh.quaternion, scale);
      }
    }

    if (world.debugDrawer) {
      if (world.debugDrawer.index !== 0) {
        debugGeometry.attributes.position.needsUpdate = true;
        debugGeometry.attributes.color.needsUpdate = true;
      }

      debugGeometry.setDrawRange(0, world.debugDrawer.index);
    }

    renderer.render(scene, camera);
  };

  requestAnimationFrame(tick);

  window.addEventListener("resize", onWindowResize, false);

  function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
});
