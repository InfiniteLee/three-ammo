/* global Ammo,THREE */

const EPS = 10e-6;

const CONSTANTS = require("../constants");

/* @param {object} worldConfig */
function World(worldConfig) {
  this.collisionConfiguration = null;
  this.dispatcher = null;
  this.broadphase = null;
  this.solver = null;
  this.physicsWorld = null;
  this.debugDrawer = null;

  this.object3Ds = new Map();
  this.collisions = new Map();
  this.collisionKeys = [];

  this.epsilon = worldConfig.epsilon || EPS;
  this.debugDrawMode = worldConfig.debugDrawMode || THREE.AmmoDebugConstants.NoDebug;
  this.maxSubSteps = worldConfig.maxSubSteps || 4;
  this.fixedTimeStep = worldConfig.fixedTimeStep || 1 / 60;
  this.collisionConfiguration = new Ammo.btDefaultCollisionConfiguration();
  this.dispatcher = new Ammo.btCollisionDispatcher(this.collisionConfiguration);
  this.broadphase = new Ammo.btDbvtBroadphase();
  this.solver = new Ammo.btSequentialImpulseConstraintSolver();
  this.physicsWorld = new Ammo.btDiscreteDynamicsWorld(
    this.dispatcher,
    this.broadphase,
    this.solver,
    this.collisionConfiguration
  );
  this.physicsWorld.setForceUpdateAllAabbs(false);
  const gravity = new Ammo.btVector3(0, CONSTANTS.GRAVITY, 0);
  if (worldConfig.hasOwnProperty("gravity")) {
    gravity.setValue(worldConfig.gravity.x, worldConfig.gravity.y, worldConfig.gravity.z);
  }
  this.physicsWorld.setGravity(gravity);
  Ammo.destroy(gravity);
  this.physicsWorld.getSolverInfo().set_m_numIterations(worldConfig.solverIterations || 10);
}

World.prototype.isDebugEnabled = function() {
  return this.debugDrawMode !== THREE.AmmoDebugConstants.NoDebug;
};

/* @param {Ammo.btCollisionObject} body */
World.prototype.addBody = function(body, object3D, group, mask) {
  this.physicsWorld.addRigidBody(body, group, mask);
  this.object3Ds.set(Ammo.getPointer(body), object3D);
};

/* @param {Ammo.btCollisionObject} body */
World.prototype.removeBody = function(body) {
  this.physicsWorld.removeRigidBody(body);
  const bodyptr = Ammo.getPointer(body);
  this.object3Ds.delete(bodyptr);
  this.collisions.delete(bodyptr);
  if (this.collisionKeys.indexOf(bodyptr) !== -1) {
    this.collisionKeys.splice(this.collisionKeys.indexOf(bodyptr), 1);
  }
};

World.prototype.updateBody = function(body) {
  if (this.object3Ds.has(Ammo.getPointer(body))) {
    this.physicsWorld.updateSingleAabb(body);
  }
};

/* @param {number} deltaTime */
World.prototype.step = function(deltaTime) {
  this.physicsWorld.stepSimulation(deltaTime, this.maxSubSteps, this.fixedTimeStep);

  for (let k = 0; k < this.collisionKeys.length; k++) {
    this.collisions.get(this.collisionKeys[k]).length = 0;
  }

  const numManifolds = this.dispatcher.getNumManifolds();
  for (let i = 0; i < numManifolds; i++) {
    const persistentManifold = this.dispatcher.getManifoldByIndexInternal(i);
    const numContacts = persistentManifold.getNumContacts();
    const body0ptr = Ammo.getPointer(persistentManifold.getBody0());
    const body1ptr = Ammo.getPointer(persistentManifold.getBody1());

    for (let j = 0; j < numContacts; j++) {
      const manifoldPoint = persistentManifold.getContactPoint(j);
      const distance = manifoldPoint.getDistance();
      if (distance <= this.epsilon) {
        if (!this.collisions.has(body0ptr)) {
          this.collisions.set(body0ptr, []);
          this.collisionKeys.push(body0ptr);
        }
        if (this.collisions.get(body0ptr).indexOf(body1ptr) === -1) {
          this.collisions.get(body0ptr).push(body1ptr);
        }
        break;
      }
    }
  }

  if (this.debugDrawer) {
    this.debugDrawer.update();
  }
};

World.prototype.destroy = function() {
  Ammo.destroy(this.collisionConfiguration);
  Ammo.destroy(this.dispatcher);
  Ammo.destroy(this.broadphase);
  Ammo.destroy(this.solver);
  Ammo.destroy(this.physicsWorld);
  Ammo.destroy(this.debugDrawer);
};

/**
 * @param {THREE.Scene} scene
 * @param {object} options
 */
World.prototype.getDebugDrawer = function(scene, options) {
  if (!this.debugDrawer) {
    options = options || {};
    options.debugDrawMode = options.debugDrawMode || this.debugDrawMode;
    this.debugDrawer = new THREE.AmmoDebugDrawer(scene, this.physicsWorld, options);
  }

  return this.debugDrawer;
};

module.exports = World;
