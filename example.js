import { World, Body, Constraint } from "./index.js";
import { createBoxShape, createSphereShape } from "three-to-ammo";
import { TYPE, CONSTRAINT, ACTIVATION_STATE } from "./src/constants.js";

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.z = 5;

const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const bodies = [];

const floorGeometry = new THREE.BoxGeometry(5, 0.1, 5);
const floorMaterial = new THREE.MeshBasicMaterial({ color: 0xff6600 });
const floorMesh = new THREE.Mesh(floorGeometry, floorMaterial);
floorMesh.position.set(0, -1, 0);
scene.add(floorMesh);

const ballGeometry = new THREE.SphereGeometry(0.5, 32, 32);
const ballMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
const ballMesh = new THREE.Mesh(ballGeometry, ballMaterial);
ballMesh.position.set(0, 2, 0);
scene.add(ballMesh);

const boxGeometry = new THREE.BoxGeometry(0.5, 0.5, 0.5);
const boxMaterial = new THREE.MeshBasicMaterial({ color: 0x00ffff });
const boxMesh = new THREE.Mesh(boxGeometry, boxMaterial);
boxMesh.position.set(-1, 2, 0);
scene.add(boxMesh);

Ammo().then(Ammo => {
  const world = new World({ debugDrawMode: THREE.AmmoDebugConstants.DrawWireframe });
  world.getDebugDrawer(scene).enable();
  const floorBody = new Body({ type: TYPE.KINEMATIC }, floorMesh, world);
  const floorShape = createBoxShape(floorMesh, {});
  floorBody.addShape(floorShape);
  bodies.push(floorBody);

  const ballBody = new Body({ type: TYPE.DYNAMIC, gravity: { x: 0, y: 0, z: 0 } }, ballMesh, world);
  const ballShape = createSphereShape(ballMesh, {});
  ballBody.addShape(ballShape);
  bodies.push(ballBody);

  const boxBody = new Body(
    { type: TYPE.DYNAMIC, gravity: { x: 0, y: 0, z: 0 }, activationState: ACTIVATION_STATE.DISABLE_DEACTIVATION },
    boxMesh,
    world
  );
  const boxShape = createBoxShape(boxMesh, {});
  boxBody.addShape(boxShape);
  bodies.push(boxBody);

  const constraint = new Constraint({ type: CONSTRAINT.LOCK }, ballBody, boxBody, world);

  window.setTimeout(() => {
    ballBody.update({ gravity: { x: 0, y: -1, z: 0 } });
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

  const tick = function(dt) {
    requestAnimationFrame(tick);

    floorMesh.rotation.y += 0.01;

    for (let i = 0; i < bodies.length; i++) {
      bodies[i].syncToPhysics();
    }
    world.step(dt);
    for (let i = 0; i < bodies.length; i++) {
      bodies[i].syncFromPhysics();
    }

    renderer.render(scene, camera);
  };

  window.requestAnimationFrame(tick);
});
