import "three";
import world from "./src/world";
import body from "./src/body";
import constraint from "./src/constraint";
import constants from "./constants";
export const World = world;
export const Body = body;
export const Constraint = constraint;
export const CONSTANTS = constants;

import { iterateGeometries } from "three-to-ammo";
const MESSAGE_TYPES = CONSTANTS.MESSAGE_TYPES;

export const WorkerHelpers = function(ammoWorker) {
  const transform = new THREE.Matrix4();
  const inverse = new THREE.Matrix4();

  const addBody = function(uuid, mesh, options = {}) {
    inverse.getInverse(mesh.parent.matrixWorld);
    transform.multiplyMatrices(inverse, mesh.matrixWorld);
    ammoWorker.postMessage({
      type: MESSAGE_TYPES.ADD_BODY,
      uuid,
      matrix: transform.elements,
      options
    });
  };

  const removeBody = function(uuid) {
    ammoWorker.postMessage({
      type: MESSAGE_TYPES.REMOVE_BODY,
      uuid
    });
  };

  const addShapes = function(uuid, mesh, options = {}) {
    inverse.getInverse(mesh.parent.matrix);
    transform.multiplyMatrices(inverse, mesh.parent.matrix);

    const vertices = [];
    const matrices = [];
    const indexes = [];

    iterateGeometries(mesh, options, (vertexArray, matrix, index) => {
      vertices.push(vertexArray);
      matrices.push(matrix);
      indexes.push(index);
    });
    ammoWorker.postMessage({
      type: MESSAGE_TYPES.ADD_SHAPES,
      uuid,
      vertices,
      matrices,
      indexes,
      matrixWorld: mesh.matrixWorld.elements,
      options
    });
  };

  const removeShapes = function(uuid, shapeIds) {
    ammoWorker.postMessage({
      type: MESSAGE_TYPES.REMOVE_SHAPES,
      uuid,
      shapeIds
    });
  };

  const addConstraint = function(bodyUuid, targetUuid, options = {}) {
    ammoWorker.postMessage({
      type: MESSAGE_TYPES.ADD_CONSTRAINT,
      bodyUuid,
      targetUuid,
      options
    });
  };

  const removeConstraint = function(constraintId) {
    ammoWorker.postMessage({
      type: MESSAGE_TYPES.REMOVE_CONSTRAINT,
      constraintId
    });
  };

  const updateBody = function(uuid, options) {
    ammoWorker.postMessage({
      type: MESSAGE_TYPES.UPDATE_BODY,
      uuid,
      options
    });
  };

  const enableDebug = function(enable, debugSharedArrayBuffer) {
    ammoWorker.postMessage({
      type: MESSAGE_TYPES.ENABLE_DEBUG,
      enable,
      debugSharedArrayBuffer
    });
  };

  const resetDynamicBody = function(uuid) {
    ammoWorker.postMessage({
      type: MESSAGE_TYPES.RESET_DYNAMIC_BODY,
      uuid
    });
  };

  return {
    addBody,
    updateBody,
    removeBody,
    addShapes,
    removeShapes,
    addConstraint,
    removeConstraint,
    enableDebug,
    resetDynamicBody
  };
};
