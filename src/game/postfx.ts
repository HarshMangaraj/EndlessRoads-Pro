import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

export interface PostFxSystem {
  render: () => void;
  setSize: (w: number, h: number) => void;
  setBloom: (strength: number) => void;
  dispose: () => void;
}

export const createPostFx = (
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  width: number,
  height: number,
  bloomStrength = 0.3,
): PostFxSystem => {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const bloom = new UnrealBloomPass(
    new THREE.Vector2(width, height),
    bloomStrength,
    0.45,
    0.78,
  );
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  return {
    render: () => composer.render(),
    setSize: (w, h) => {
      composer.setSize(w, h);
      bloom.resolution.set(w, h);
    },
    setBloom: (s) => { bloom.strength = s; },
    dispose: () => composer.dispose(),
  };
};
