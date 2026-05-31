import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

export interface PostFxSystem {
  render: () => void;
  setSize: (w: number, h: number) => void;
  setBloom: (strength: number, nightFactor?: number) => void;
  setEnabled: (enabled: boolean) => void;
  dispose: () => void;
}

export const createPostFx = (
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  width: number,
  height: number,
  bloomStrength = 0.3,
  enabled = true,
): PostFxSystem => {
  const w = Math.max(1, width);
  const h = Math.max(1, height);

  renderer.outputColorSpace = THREE.SRGBColorSpace;

  let useComposer = enabled;

  const composer = new EffectComposer(renderer);
  composer.setSize(w, h);
  composer.setPixelRatio(renderer.getPixelRatio());

  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  const bloom = new UnrealBloomPass(
    new THREE.Vector2(w, h),
    bloomStrength,
    0.45,
    0.92,
  );
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  return {
    render: () => {
      if (!useComposer) {
        renderer.render(scene, camera);
        return;
      }
      try {
        composer.render();
      } catch {
        useComposer = false;
        renderer.render(scene, camera);
      }
    },
    setSize: (nw, nh) => {
      const sw = Math.max(1, nw);
      const sh = Math.max(1, nh);
      composer.setSize(sw, sh);
      composer.setPixelRatio(renderer.getPixelRatio());
      bloom.resolution.set(sw, sh);
    },
    setBloom: (s, nightFactor = 0) => {
      // Keep bloom modest; nightFactor only nudges it a bit
      const base = s;
      const nightBoost = 0.35 + nightFactor * 0.45; // 0.35 → 0.8
      bloom.strength = base * nightBoost;
      bloom.radius = 0.3 + nightFactor * 0.1;
      bloom.threshold = THREE.MathUtils.lerp(0.9, 0.75, nightFactor);
    },
    setEnabled: (enabled: boolean) => {
      useComposer = enabled;
    },
    dispose: () => composer.dispose(),
  };
};
