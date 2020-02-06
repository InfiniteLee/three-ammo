import CONSTANTS from "../constants.js";
const MESSAGE_TYPES = CONSTANTS.MESSAGE_TYPES;
const TYPE = CONSTANTS.TYPE;
const SHAPE = CONSTANTS.SHAPE;
const CONSTRAINT = CONSTANTS.CONSTRAINT;
const BUFFER_CONFIG = CONSTANTS.BUFFER_CONFIG;
const BUFFER_STATE = CONSTANTS.BUFFER_STATE;
import { World, Body, Constraint } from "../index.js";
import "three";
import { DefaultBufferSize } from "ammo-debug-drawer";

import { createCollisionShapes } from "three-to-ammo";
import Ammo from "ammo.js/builds/ammo.wasm.js";
import AmmoWasm from "ammo.js/builds/ammo.wasm.wasm";
const AmmoModule = Ammo.bind(undefined, {
  locateFile(path) {
    if (path.endsWith(".wasm")) {
      return new URL(AmmoWasm, location.origin).href;
    }
    return path;
  }
});

const uuids = [];
const bodies = {};
const shapes = {};
const constraints = {};
const matrices = {};
const indexes = {};

const addBodyQueue = [];
const removeBodyQueue = [];
const addShapeQueue = [];
const addConstraintQueue = [];
const resetDynamicBodyQueue = [];

let freeIndex = 0;
const freeIndexArray = new Int32Array(BUFFER_CONFIG.MAX_BODIES);
for (let i = 0; i < BUFFER_CONFIG.MAX_BODIES - 1; i++) {
  freeIndexArray[i] = i + 1;
}
freeIndexArray[BUFFER_CONFIG.MAX_BODIES - 1] = -1;

const tempMatrix = new THREE.Matrix4();

let world, headerIntArray, objectMatricesFloatArray, lastTick, getPointer;
let usingSharedArrayBuffer = false;

function isBufferConsumed() {
  if (usingSharedArrayBuffer) {
    return headerIntArray && Atomics.load(headerIntArray, 0) !== BUFFER_STATE.READY;
  } else {
    return objectMatricesFloatArray && objectMatricesFloatArray.buffer.byteLength !== 0;
  }
}

function releaseBuffer() {
  if (usingSharedArrayBuffer) {
    Atomics.store(headerIntArray, 0, BUFFER_STATE.READY);
  } else {
    postMessage({ type: MESSAGE_TYPES.TRANSFER_DATA, objectMatricesFloatArray }, [objectMatricesFloatArray.buffer]);
  }
}

const tick = () => {
  if (isBufferConsumed()) {
    const now = performance.now();
    const dt = now - lastTick;
    world.step(dt / 1000);
    lastTick = now;

    while (addBodyQueue.length > 0) {
      addBody(addBodyQueue.pop());
    }

    while (addShapeQueue.length > 0) {
      addShape(addShapeQueue.pop());
    }

    while (addConstraintQueue.length > 0) {
      addConstraint(addConstraintQueue.pop());
    }

    while (resetDynamicBodyQueue.length > 0) {
      resetDynamicBody(resetDynamicBodyQueue.pop());
    }

    while (removeBodyQueue.length > 0) {
      removeBody(removeBodyQueue.pop());
    }

    for (let i = 0; i < uuids.length; i++) {
      const uuid = uuids[i];
      const body = bodies[uuid];
      if (body.type === TYPE.DYNAMIC) {
        body.syncFromPhysics();
      } else if (body.type === TYPE.KINEMATIC) {
        tempMatrix.fromArray(objectMatricesFloatArray, i * 16);
        matrices[uuid].copy(tempMatrix);
        body.syncToPhysics();
      }

      const matrix = matrices[uuid];
      objectMatricesFloatArray.set(matrix.elements, i * 16);
    }

    releaseBuffer();
  }
};
const initSharedArrayBuffer = sharedArrayBuffer => {
  /** HEADER SCHEMA
   * 0: BUFFER STATE
   * 1: FREE INDEX
   */
  usingSharedArrayBuffer = true;
  headerIntArray = new Int32Array(sharedArrayBuffer, 0, BUFFER_CONFIG.HEADER_LENGTH);
  objectMatricesFloatArray = new Float32Array(sharedArrayBuffer, BUFFER_CONFIG.HEADER_LENGTH * 4);
};

const initTransferrables = arrayBuffer => {
  objectMatricesFloatArray = new Float32Array(arrayBuffer);
};

function initDebug(debugSharedArrayBuffer, world) {
  const debugIndexArray = new Uint32Array(debugSharedArrayBuffer, 0, 1);
  const debugVerticesArray = new Float32Array(debugSharedArrayBuffer, 4, DefaultBufferSize);
  const debugColorsArray = new Float32Array(debugSharedArrayBuffer, 4 + DefaultBufferSize, DefaultBufferSize);
  world.getDebugDrawer(debugIndexArray, debugVerticesArray, debugColorsArray);
}

function addBody({ uuid, matrix, options }) {
  if (freeIndex !== -1) {
    const nextFreeIndex = freeIndexArray[freeIndex];
    freeIndexArray[freeIndex] = -1;

    indexes[uuid] = freeIndex;
    uuids.push(uuid);
    const transform = new THREE.Matrix4();
    transform.fromArray(matrix);
    matrices[uuid] = transform;
    objectMatricesFloatArray.set(transform, freeIndex * 16);
    bodies[uuid] = new Body(options || {}, transform, world);

    postMessage({ type: MESSAGE_TYPES.BODY_READY, uuid, index: freeIndex });
    freeIndex = nextFreeIndex;
  }
}

function removeBody(uuid) {
  bodies[uuid].destroy();
  delete bodies[uuid];
  delete matrices[uuid];
  delete shapes[uuid];
  const index = indexes[uuid];
  freeIndexArray[index] = freeIndex;
  freeIndex = index;
  delete indexes[uuid];
  uuids.splice(uuids.indexOf(uuid), 1);
}

function addShape({ uuid, vertices, matrices, indexes, matrixWorld, options }) {
  const physicsShapes = createCollisionShapes(vertices, matrices, indexes, matrixWorld, options || { type: SHAPE.BOX });

  const shapeIds = [];

  for (let i = 0; i < physicsShapes.length; i++) {
    const shape = physicsShapes[i];
    bodies[uuid].addShape(shape);
    const shapeId = getPointer(shape);
    shapes[shapeId] = shape;
    shapeIds.push(shapeId);
  }

  postMessage({ type: MESSAGE_TYPES.SHAPES_READY, uuid, shapeIds });
}

function addConstraint({ bodyUuid, targetUuid, options }) {
  if (bodies[bodyUuid] && bodies[targetUuid]) {
    options = options || {};
    if (!options.hasOwnProperty("type")) {
      options.type = CONSTRAINT.LOCK;
    }
    const constraint = new Constraint(options, bodies[bodyUuid], bodies[targetUuid], world);
    const constraintId = getPointer(constraint.physicsConstraint);
    constraints[constraintId] = constraint;
    postMessage({ type: MESSAGE_TYPES.CONSTRAINT_READY, bodyUuid, targetUuid, constraintId });
  }
}

function resetDynamicBody(uuid) {
  if (bodies[uuid]) {
    const body = bodies[uuid];
    const index = indexes[uuid];
    matrices[uuid].fromArray(objectMatricesFloatArray, index * 16);
    body.syncToPhysics(true);
    body.physicsBody.getLinearVelocity().setValue(0, 0, 0);
    body.physicsBody.getAngularVelocity().setValue(0, 0, 0);
  }
}

onmessage = async event => {
  if (event.data.type === MESSAGE_TYPES.INIT) {
    AmmoModule().then(Ammo => {
      getPointer = Ammo.getPointer;

      if (event.data.sharedArrayBuffer) {
        initSharedArrayBuffer(event.data.sharedArrayBuffer);
      } else if (event.data.arrayBuffer) {
        initTransferrables(event.data.arrayBuffer);
      } else {
        //TODO error
      }

      world = new World(event.data.worldConfig || {});
      lastTick = performance.now();
      self.setInterval(tick, 0);
      postMessage({ type: MESSAGE_TYPES.READY });
    });
  } else if (event.data.type === MESSAGE_TYPES.TRANSFER_DATA) {
    objectMatricesFloatArray = event.data.objectMatricesFloatArray;
  } else if (world) {
    switch (event.data.type) {
      case MESSAGE_TYPES.ADD_BODY: {
        addBodyQueue.push(event.data);
        break;
      }

      case MESSAGE_TYPES.UPDATE_BODY: {
        const uuid = event.data.uuid;
        if (bodies[uuid]) {
          bodies[uuid].update(event.data.options);
          bodies[uuid].physicsBody.activate(true);
        }
        break;
      }

      case MESSAGE_TYPES.REMOVE_BODY: {
        const uuid = event.data.uuid;
        if (uuids.indexOf(uuid) !== -1) {
          removeBodyQueue.push(uuid);
        }
        break;
      }

      case MESSAGE_TYPES.ADD_SHAPES: {
        const uuid = event.data.uuid;
        if (bodies[uuid]) {
          addShape(event.data);
        } else {
          addShapeQueue.push(event.data);
        }
        break;
      }

      case MESSAGE_TYPES.REMOVE_SHAPES: {
        const uuid = event.data.uuid;
        const shapeIds = event.data.shapeIds;
        if (bodies[uuid]) {
          for (let i = 0; i < shapeIds.length; i++) {
            const shape = shapes[shapeIds[i]];
            bodies[uuid].removeShape(shape);
          }
        }
        break;
      }

      case MESSAGE_TYPES.ADD_CONSTRAINT: {
        const bodyUuid = event.data.bodyUuid;
        const targetUuid = event.data.targetUuid;
        if (bodies[bodyUuid] && bodies[targetUuid]) {
          addConstraint(event.data);
        } else {
          addConstraintQueue.push(event.data);
        }
        break;
      }

      case MESSAGE_TYPES.REMOVE_CONSTRAINT: {
        const constraintId = event.data.constraintId;
        if (constraints[constraintId]) {
          constraints[constraintId].destroy();
        }
        break;
      }

      case MESSAGE_TYPES.ENABLE_DEBUG: {
        const enable = event.data.enable;
        if (!world.debugDrawer) {
          initDebug(event.data.debugSharedArrayBuffer, world);
        }

        if (world.debugDrawer) {
          if (enable) {
            world.debugDrawer.enable();
          } else {
            world.debugDrawer.disable();
          }
        }
        break;
      }

      case MESSAGE_TYPES.RESET_DYNAMIC_BODY: {
        resetDynamicBodyQueue.push(event.data.uuid);
        break;
      }
    }
  } else {
    console.error("Error: World Not Initialized", event.data);
  }
};
