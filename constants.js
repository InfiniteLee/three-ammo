module.exports = {
  GRAVITY: -9.8,
  MAX_INTERVAL: 4 / 60,
  ITERATIONS: 10,
  SIMULATION_RATE: 8.333, // 8.333ms / 120hz
  ACTIVATION_STATE: {
    ACTIVE_TAG: "active",
    ISLAND_SLEEPING: "islandSleeping",
    WANTS_DEACTIVATION: "wantsDeactivation",
    DISABLE_DEACTIVATION: "disableDeactivation",
    DISABLE_SIMULATION: "disableSimulation"
  },
  COLLISION_FLAG: {
    STATIC_OBJECT: 1,
    KINEMATIC_OBJECT: 2,
    NO_CONTACT_RESPONSE: 4,
    CUSTOM_MATERIAL_CALLBACK: 8, //this allows per-triangle material (friction/restitution)
    CHARACTER_OBJECT: 16,
    DISABLE_VISUALIZE_OBJECT: 32, //disable debug drawing
    DISABLE_SPU_COLLISION_PROCESSING: 64 //disable parallel/SPU processing
  },
  TYPE: {
    STATIC: "static",
    DYNAMIC: "dynamic",
    KINEMATIC: "kinematic"
  },
  SHAPE: {
    BOX: "box",
    CYLINDER: "cylinder",
    SPHERE: "sphere",
    CAPSULE: "capsule",
    CONE: "cone",
    HULL: "hull",
    HACD: "hacd",
    VHACD: "vhacd",
    MESH: "mesh",
    HEIGHTFIELD: "heightfield"
  },
  FIT: {
    ALL: "all",
    MANUAL: "manual"
  },
  CONSTRAINT: {
    LOCK: "lock",
    FIXED: "fixed",
    SPRING: "spring",
    SLIDER: "slider",
    HINGE: "hinge",
    CONE_TWIST: "coneTwist",
    POINT_TO_POINT: "pointToPoint"
  },
  MESSAGE_TYPES: {
    INIT: 0,
    READY: 1,
    ADD_BODY: 2,
    BODY_READY: 3,
    UPDATE_BODY: 4,
    REMOVE_BODY: 5,
    ADD_SHAPES: 6,
    REMOVE_SHAPES: 7,
    ADD_CONSTRAINT: 8,
    REMOVE_CONSTRAINT: 9,
    ENABLE_DEBUG: 10,
    RESET_DYNAMIC_BODY: 11,
    ACTIVATE_BODY: 12,
    TRANSFER_DATA: 13
  },
  BUFFER_CONFIG: {
    HEADER_LENGTH: 2,
    MAX_BODIES: 10000,
    MATRIX_OFFSET: 0,
    LINEAR_VELOCITY_OFFSET: 16,
    ANGULAR_VELOCITY_OFFSET: 17,
    COLLISIONS_OFFSET: 18,
    BODY_DATA_SIZE: 26
  },
  BUFFER_STATE: {
    UNINITIALIZED: 0,
    READY: 1,
    CONSUMED: 2
  }
};
