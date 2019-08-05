/* global Ammo,THREE */
const AmmoDebugDrawer = require("ammo-debug-drawer");
const threeToAmmo = require("three-to-ammo");
const CONSTANTS = require("../constants"),
  ACTIVATION_STATE = CONSTANTS.ACTIVATION_STATE,
  COLLISION_FLAG = CONSTANTS.COLLISION_FLAG,
  SHAPE = CONSTANTS.SHAPE,
  TYPE = CONSTANTS.TYPE,
  FIT = CONSTANTS.FIT;

const ACTIVATION_STATES = [
  ACTIVATION_STATE.ACTIVE_TAG,
  ACTIVATION_STATE.ISLAND_SLEEPING,
  ACTIVATION_STATE.WANTS_DEACTIVATION,
  ACTIVATION_STATE.DISABLE_DEACTIVATION,
  ACTIVATION_STATE.DISABLE_SIMULATION
];

const RIGID_BODY_FLAGS = {
  NONE: 0,
  DISABLE_WORLD_GRAVITY: 1
};

function almostEqualsVector3(epsilon, u, v) {
  return Math.abs(u.x - v.x) < epsilon && Math.abs(u.y - v.y) < epsilon && Math.abs(u.z - v.z) < epsilon;
}

function almostEqualsBtVector3(epsilon, u, v) {
  return Math.abs(u.x() - v.x()) < epsilon && Math.abs(u.y() - v.y()) < epsilon && Math.abs(u.z() - v.z()) < epsilon;
}

function almostEqualsQuaternion(epsilon, u, v) {
  return (
    (Math.abs(u.x - v.x) < epsilon &&
      Math.abs(u.y - v.y) < epsilon &&
      Math.abs(u.z - v.z) < epsilon &&
      Math.abs(u.w - v.w) < epsilon) ||
    (Math.abs(u.x + v.x) < epsilon &&
      Math.abs(u.y + v.y) < epsilon &&
      Math.abs(u.z + v.z) < epsilon &&
      Math.abs(u.w + v.w) < epsilon)
  );
}

/**
 * Initializes a body component, assigning it to the physics system and binding listeners for
 * parsing the elements geometry.
 */
function Body(bodyConfig, object3D, world) {
  this.loadedEvent = bodyConfig.loadedEvent ? bodyConfig.loadedEvent : "";
  this.mass = bodyConfig.hasOwnProperty("mass") ? bodyConfig.mass : 1;
  const worldGravity = world.physicsWorld.getGravity();
  this.gravity = new Ammo.btVector3(worldGravity.x(), worldGravity.y(), worldGravity.z());
  if (bodyConfig.gravity) {
    this.gravity.setValue(bodyConfig.gravity.x, bodyConfig.gravity.y, bodyConfig.gravity.z);
  }
  this.linearDamping = bodyConfig.hasOwnProperty("linearDamping") ? bodyConfig.linearDamping : 0.01;
  this.angularDamping = bodyConfig.hasOwnProperty("angularDamping") ? bodyConfig.angularDamping : 0.01;
  this.linearSleepingThreshold = bodyConfig.hasOwnProperty("linearSleepingThreshold")
    ? bodyConfig.linearSleepingThreshold
    : 1.6;
  this.angularSleepingThreshold = bodyConfig.hasOwnProperty("angularSleepingThreshold")
    ? bodyConfig.angularSleepingThreshold
    : 2.5;
  this.angularFactor = new THREE.Vector3(1, 1, 1);
  if (bodyConfig.angularFactor) {
    this.angularFactor.copy(bodyConfig.angularFactor);
  }
  this.activationState =
    bodyConfig.activationState && ACTIVATION_STATES.indexOf(bodyConfig.activationState) !== -1
      ? bodyConfig.activationState
      : ACTIVATION_STATE.ACTIVE_TAG;
  this.type = bodyConfig.type ? bodyConfig.type : TYPE.DYNAMIC;
  this.emitCollisionEvents = bodyConfig.hasOwnProperty("emitCollisionEvents") ? bodyConfig.emitCollisionEvents : false;
  this.disableCollision = bodyConfig.hasOwnProperty("disableCollision") ? bodyConfig.disableCollision : false;
  this.collisionFilterGroup = bodyConfig.hasOwnProperty("collisionFilterGroup") ? bodyConfig.collisionFilterGroup : 1; //32-bit mask
  this.collisionFilterMask = bodyConfig.hasOwnProperty("collisionFilterMask") ? bodyConfig.collisionFilterMask : 1; //32-bit mask
  this.scaleAutoUpdate = bodyConfig.hasOwnProperty("scaleAutoUpdate") ? bodyConfig.scaleAutoUpdate : true;

  this.object3D = object3D;
  this.world = world;
  this.shapes = [];

  this._initBody();
}

/**
 * Parses an element's geometry and component metadata to create an Ammo body instance for the component.
 */
Body.prototype._initBody = (function() {
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const boundingBox = new THREE.Box3();

  return function() {
    this.localScaling = new Ammo.btVector3();

    const obj = this.object3D;
    obj.getWorldPosition(pos);
    obj.getWorldQuaternion(quat);

    this.prevScale = new THREE.Vector3(1, 1, 1);
    this.prevNumChildShapes = 0;

    this.msTransform = new Ammo.btTransform();
    this.msTransform.setIdentity();
    this.rotation = new Ammo.btQuaternion(quat.x, quat.y, quat.z, quat.w);

    this.msTransform.getOrigin().setValue(pos.x, pos.y, pos.z);
    this.msTransform.setRotation(this.rotation);

    this.motionState = new Ammo.btDefaultMotionState(this.msTransform);

    this.localInertia = new Ammo.btVector3(0, 0, 0);

    this.compoundShape = new Ammo.btCompoundShape(true);

    this.rbInfo = new Ammo.btRigidBodyConstructionInfo(
      this.mass,
      this.motionState,
      this.compoundShape,
      this.localInertia
    );
    this.physicsBody = new Ammo.btRigidBody(this.rbInfo);
    this.physicsBody.setActivationState(ACTIVATION_STATES.indexOf(this.activationState) + 1);
    this.physicsBody.setSleepingThresholds(this.linearSleepingThreshold, this.angularSleepingThreshold);

    this.physicsBody.setDamping(this.linearDamping, this.angularDamping);

    const angularFactor = new Ammo.btVector3(this.angularFactor.x, this.angularFactor.y, this.angularFactor.z);
    this.physicsBody.setAngularFactor(angularFactor);
    Ammo.destroy(angularFactor);

    if (!almostEqualsBtVector3(0.001, this.gravity, this.world.physicsWorld.getGravity())) {
      this.physicsBody.setGravity(this.gravity);
      this.physicsBody.setFlags(RIGID_BODY_FLAGS.DISABLE_WORLD_GRAVITY);
    }

    this.updateCollisionFlags();

    this.world.addBody(this.physicsBody, this.object3D, this.collisionFilterGroup, this.collisionFilterMask);

    if (this.emitCollisionEvents) {
      this.world.addEventListener(this.physicsBody);
    }
  };
})();

/**
 * Updates the body when shapes have changed. Should be called whenever shapes are added/removed or scale is changed.
 */
Body.prototype.updateShapes = (function() {
  const needsPolyhedralInitialization = [SHAPE.HULL, SHAPE.HACD, SHAPE.VHACD];
  return function() {
    let updated = false;

    const obj = this.object3D;
    if (this.scaleAutoUpdate && this.prevScale && !almostEqualsVector3(0.001, obj.scale, this.prevScale)) {
      this.prevScale.copy(obj.scale);
      updated = true;

      this.localScaling.setValue(this.prevScale.x, this.prevScale.y, this.prevScale.z);
      this.compoundShape.setLocalScaling(this.localScaling);
    }

    if (this.shapesChanged) {
      this.shapesChanged = false;
      updated = true;
      if (this.type === TYPE.DYNAMIC) {
        this.updateMass();
      }

      this.world.updateBody(this.physicsBody);
    }

    //call initializePolyhedralFeatures for hull shapes if debug is turned on and/or scale changes
    if (this.world.isDebugEnabled() && (updated || !this.polyHedralFeaturesInitialized)) {
      for (let i = 0; i < this.shapes.length; i++) {
        const collisionShape = this.shapes[i];
        if (needsPolyhedralInitialization.indexOf(collisionShape.type) !== -1) {
          collisionShape.initializePolyhedralFeatures(0);
        }
      }
      this.polyHedralFeaturesInitialized = true;
    }
  };
})();

/**
 * Update the configuration of the body.
 */
Body.prototype.update = function(bodyConfig) {
  if (
    (bodyConfig.type && bodyConfig.type !== this.type) ||
    (bodyConfig.disableCollision && bodyConfig.disableCollision !== this.disableCollision)
  ) {
    if (bodyConfig.type) this.type = bodyConfig.type;
    if (bodyConfig.disableCollision) this.disableCollision = bodyConfig.disableCollision;
    this.updateCollisionFlags();
  }

  if (bodyConfig.activationState && bodyConfig.activationState !== this.activationState) {
    this.activationState = bodyConfig.activationState;
    this.physicsBody.forceActivationState(ACTIVATION_STATES.indexOf(this.activationState) + 1);
    if (this.activationState === ACTIVATION_STATE.ACTIVE_TAG) {
      this.physicsBody.activate(true);
    }
  }

  if (
    (bodyConfig.collisionFilterGroup && bodyConfig.collisionFilterGroup !== this.collisionFilterGroup) ||
    (bodyConfig.collisionFilterMask && bodyConfig.collisionFilterMask !== this.collisionFilterMask)
  ) {
    if (bodyConfig.collisionFilterGroup) this.collisionFilterGroup = bodyConfig.collisionFilterGroup;
    if (bodyConfig.collisionFilterMask) this.collisionFilterMask = bodyConfig.collisionFilterMask;
    const broadphaseProxy = this.physicsBody.getBroadphaseProxy();
    broadphaseProxy.set_m_collisionFilterGroup(this.collisionFilterGroup);
    broadphaseProxy.set_m_collisionFilterMask(this.collisionFilterMask);
    this.world.broadphase
      .getOverlappingPairCache()
      .removeOverlappingPairsContainingProxy(broadphaseProxy, this.world.dispatcher);
  }

  if (
    (bodyConfig.linearDamping && bodyConfig.linearDamping != this.linearDamping) ||
    (bodyConfig.angularDamping && bodyConfig.angularDamping != this.angularDamping)
  ) {
    if (bodyConfig.linearDamping) this.linearDamping = bodyConfig.linearDamping;
    if (bodyConfig.angularDamping) this.angularDamping = bodyConfig.angularDamping;
    this.physicsBody.setDamping(this.linearDamping, this.angularDamping);
  }

  if (bodyConfig.gravity) {
    this.gravity.setValue(bodyConfig.gravity.x, bodyConfig.gravity.y, bodyConfig.gravity.z);
    if (!almostEqualsBtVector3(0.001, this.gravity, this.physicsBody.getGravity())) {
      if (!almostEqualsBtVector3(0.001, this.gravity, this.world.physicsWorld.getGravity())) {
        this.physicsBody.setFlags(RIGID_BODY_FLAGS.DISABLE_WORLD_GRAVITY);
      } else {
        this.physicsBody.setFlags(RIGID_BODY_FLAGS.NONE);
      }
      this.physicsBody.setGravity(this.gravity);
    }
  }

  if (
    (bodyConfig.linearSleepingThreshold && bodyConfig.linearSleepingThreshold != this.linearSleepingThreshold) ||
    (bodyConfig.angularSleepingThreshold && bodyConfig.angularSleepingThreshold != this.angularSleepingThreshold)
  ) {
    if (bodyConfig.linearSleepingThreshold) this.linearSleepingThreshold = bodyConfig.linearSleepingThreshold;
    if (bodyConfig.angularSleepingThreshold) this.angularSleepingThreshold = bodyConfig.angularSleepingThreshold;
    this.physicsBody.setSleepingThresholds(this.linearSleepingThreshold, this.angularSleepingThreshold);
  }

  if (bodyConfig.angularFactor && !almostEqualsVector3(0.001, bodyConfig.angularFactor, this.angularFactor)) {
    this.angularFactor.copy(bodyConfig.angularFactor);
    const angularFactor = new Ammo.btVector3(this.angularFactor.x, this.angularFactor.y, this.angularFactor.z);
    this.physicsBody.setAngularFactor(angularFactor);
    Ammo.destroy(angularFactor);
  }

  //TODO: support dynamic update for other properties
};

/**
 * Removes the component and all physics and scene side effects.
 */
Body.prototype.destroy = function() {
  if (this.triMesh) Ammo.destroy(this.triMesh);
  if (this.localScaling) Ammo.destroy(this.localScaling);
  if (this.compoundShape) Ammo.destroy(this.compoundShape);
  this.world.removeBody(this.physicsBody);
  Ammo.destroy(this.physicsBody);
  delete this.physicsBody;
  Ammo.destroy(this.rbInfo);
  Ammo.destroy(this.msTransform);
  Ammo.destroy(this.motionState);
  Ammo.destroy(this.localInertia);
  Ammo.destroy(this.rotation);
  Ammo.destroy(this.gravity);
};

/**
 * Updates the rigid body's position, velocity, and rotation, based on the scene.
 */
Body.prototype.syncToPhysics = (function() {
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const q2 = new THREE.Vector3();
  const v2 = new THREE.Vector3();
  return function(setCenterOfMassTransform) {
    const body = this.physicsBody;
    if (!body) return;

    this.motionState.getWorldTransform(this.msTransform);

    this.object3D.getWorldPosition(v);
    this.object3D.getWorldQuaternion(q);

    const position = this.msTransform.getOrigin();
    v2.set(position.x(), position.y(), position.z());

    const quaternion = this.msTransform.getRotation();
    q2.set(quaternion.x(), quaternion.y(), quaternion.z(), quaternion.w());

    if (!almostEqualsVector3(0.001, v, v2) || !almostEqualsQuaternion(0.001, q, q2)) {
      if (!this.physicsBody.isActive()) {
        this.physicsBody.activate(true);
      }
      this.msTransform.getOrigin().setValue(v.x, v.y, v.z);
      this.rotation.setValue(q.x, q.y, q.z, q.w);
      this.msTransform.setRotation(this.rotation);
      this.motionState.setWorldTransform(this.msTransform);

      if (this.type === TYPE.STATIC || setCenterOfMassTransform) {
        this.physicsBody.setCenterOfMassTransform(this.msTransform);
      }
    }
  };
})();

/**
 * Updates the scene object's position and rotation, based on the physics simulation.
 */
Body.prototype.syncFromPhysics = (function() {
  const v = new THREE.Vector3(),
    q1 = new THREE.Quaternion(),
    q2 = new THREE.Quaternion();
  return function() {
    this.motionState.getWorldTransform(this.msTransform);
    const position = this.msTransform.getOrigin();
    const quaternion = this.msTransform.getRotation();

    const body = this.physicsBody;

    if (!body) return;

    q1.set(quaternion.x(), quaternion.y(), quaternion.z(), quaternion.w());
    this.object3D.parent.getWorldQuaternion(q2);
    q1.multiply(q2.inverse());
    this.object3D.quaternion.copy(q1);

    v.set(position.x(), position.y(), position.z());
    this.object3D.parent.worldToLocal(v);
    this.object3D.position.copy(v);
  };
})();

Body.prototype.addShape = function(collisionShape) {
  if (collisionShape.type === SHAPE.MESH && this.type !== TYPE.STATIC) {
    console.warn("non-static mesh colliders not supported");
    return;
  }

  this.shapes.push(collisionShape);
  this.compoundShape.addChildShape(collisionShape.localTransform, collisionShape);
  this.shapesChanged = true;
  this.updateShapes();
};

Body.prototype.removeShape = function(collisionShape) {
  const index = this.shapes.indexOf(collisionShape);
  if (this.compoundShape && index !== -1 && this.physicsBody) {
    this.compoundShape.removeChildShape(this.shapes[index]);
    this.shapesChanged = true;
    this.shapes.splice(index, 1);
    this.updateShapes();
    collisionShape.destroy();
    Ammo.destroy(collisionShape.localTransform);
  }
};

Body.prototype.updateMass = function() {
  const shape = this.physicsBody.getCollisionShape();
  const mass = this.type === TYPE.DYNAMIC ? this.mass : 0;
  shape.calculateLocalInertia(mass, this.localInertia);
  this.physicsBody.setMassProps(mass, this.localInertia);
  this.physicsBody.updateInertiaTensor();
};

Body.prototype.updateCollisionFlags = function() {
  let flags = this.disableCollision ? 4 : 0;
  switch (this.type) {
    case TYPE.STATIC:
      flags |= COLLISION_FLAG.STATIC_OBJECT;
      break;
    case TYPE.KINEMATIC:
      flags |= COLLISION_FLAG.KINEMATIC_OBJECT;
      break;
    default:
      this.physicsBody.applyGravity();
      break;
  }
  this.physicsBody.setCollisionFlags(flags);

  this.updateMass();

  // TODO: enable CCD if dynamic?
  // this.physicsBody.setCcdMotionThreshold(0.001);
  // this.physicsBody.setCcdSweptSphereRadius(0.001);

  this.world.updateBody(this.physicsBody);
};

Body.prototype.getVelocity = function() {
  return this.physicsBody.getLinearVelocity();
};

module.exports = Body;
