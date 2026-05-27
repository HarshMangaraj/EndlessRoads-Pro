import React, {
  useEffect, useRef, useState, useCallback,
} from "react";
import * as THREE from "three";
import {
  BIOMES, BiomeKey, BiomeWeights,
  ROAD_WIDTH as RW, ROAD_SEGS, ROAD_STEP, ROAD_TOTAL,
  RAIL_SEGS, RAIL_STEP, RAIL_TOTAL,
  TILE_SIZE, TILE_GRID,
  CLOUD_COUNT, CIRRUS_COUNT, RAIN_COUNT, SNOW_COUNT, STAR_COUNT,
  VEG_RADIUS, VEG_CELL,
  MAX_SPEED, TWO_PI,
} from "./constants";
import {
  terrainHeight, biomeWeightsAt, dominantBiome,
  createPathState, getGroundColorAt, hash,
} from "./terrain";
import { carAnchorY, isOnRoad, isOnSidewalk, ROAD_HALF } from "./roadNetwork";
import { resolveObstacleCollisions } from "./collisions";
import { createCity } from "./city";
import { createPostFx } from "./postfx";
import { createGameAudio } from "./audio";
import { createRoadRenderer } from "./roads";
import { createIntersections } from "./intersections";
import { createPedestrians } from "./pedestrians";
import { createTraffic } from "./traffic";
import { createStarterAssets, loadHdLamppost, type QualityTier } from "./assets";
import { createVegetation } from "./vegetation";
import { createDistantPeaks } from "./distantPeaks";
import { setActiveMap, getActiveMap, type MapId } from "./maps";
import HUD from "../components/HUD";
import Minimap, { MinimapHandle } from "../components/Minimap";
import TouchControls from "../components/TouchControls";
import PauseMenu from "../components/PauseMenu";
import GraphicsSettings, { Quality } from "../components/GraphicsSettings";
import CarColorPicker, { CAR_COLORS, CarColorId } from "../components/CarColorPicker";
import MapSelector from "../components/MapSelector";

export default function DrivingGame() {
  const mountRef    = useRef<HTMLDivElement>(null);
  const minimapRef  = useRef<MinimapHandle>(null);
  const flashRef    = useRef<HTMLDivElement>(null);

  const [weather,      setWeather]      = useState("sunny");
  const [timeOfDay,    setTimeOfDay]    = useState(0.25);
  const [autoTime,     setAutoTime]     = useState(true);
  const [speed,        setSpeed]        = useState(0);
  const [gear,         setGear]         = useState("N");
  const [rpm,          setRpm]          = useState(0);
  const [currentBiome, setCurrentBiome] = useState("");
  const [showBiome,    setShowBiome]    = useState(false);
  const [paused,       setPaused]       = useState(false);
  const [quality,      setQuality]      = useState<Quality>("high");
  const [loadStatus,   setLoadStatus]   = useState("");
  const [cameraMode,   setCameraMode]   = useState<"chase" | "hood" | "cinematic">("chase");
  const [carColor,     setCarColor]     = useState<CarColorId>("crimson");
  const [mapId,        setMapId]        = useState<MapId>("forest");
  const [worldLoading, setWorldLoading] = useState(false);
  const [audioReady, setAudioReady] = useState(false);
  const [audioMuted, setAudioMuted] = useState(false);

  const weatherRef      = useRef("sunny");
  const timeRef         = useRef(0.25);
  const autoTimeRef     = useRef(true);
  const biomeTimerRef   = useRef(0);
  const lastBiomeRef    = useRef("");
  const touchGasRef     = useRef(false);
  const touchBrakeRef   = useRef(false);
  const touchLeftRef    = useRef(false);
  const touchRightRef   = useRef(false);
  const pausedRef       = useRef(false);
  const cameraModeRef   = useRef<"chase" | "hood" | "cinematic">("chase");
  const resetRef        = useRef(false);
  const bodyColorRef    = useRef(0xb3261e);
  const qualityRef      = useRef<QualityTier>("high");
  const mapIdRef        = useRef<MapId>("forest");

  useEffect(() => { weatherRef.current = weather; }, [weather]);
  useEffect(() => { timeRef.current    = timeOfDay; }, [timeOfDay]);
  useEffect(() => { autoTimeRef.current = autoTime; }, [autoTime]);
  useEffect(() => { pausedRef.current = paused; }, [paused]);
  useEffect(() => { cameraModeRef.current = cameraMode; }, [cameraMode]);
  useEffect(() => {
    const found = CAR_COLORS.find(c => c.id === carColor);
    if (found) bodyColorRef.current = found.hex;
  }, [carColor]);
  useEffect(() => { qualityRef.current = quality; }, [quality]);
  useEffect(() => { mapIdRef.current = mapId; }, [mapId]);

  const handleMapChange = useCallback((id: MapId) => {
    if (id === mapIdRef.current) return;
    setWorldLoading(true);
    setMapId(id);
    setCurrentBiome("");
  }, []);

  const handleWeather = useCallback((w: string) => setWeather(w), []);
  const handleTimeChange = useCallback((v: number) => {
    setTimeOfDay(v);
    timeRef.current = v;
  }, []);
  const handleAutoTimeChange = useCallback((v: boolean) => {
    setAutoTime(v);
    autoTimeRef.current = v;
  }, []);

  const audioRef = useRef<ReturnType<typeof createGameAudio> | null>(null);

  const enableAudio = useCallback(async () => {
    if (!audioRef.current) return;
    await audioRef.current.unlock();
    setAudioReady(true);
  }, []);

  const toggleAudioMute = useCallback(() => {
    setAudioMuted(m => {
      const next = !m;
      audioRef.current?.setMuted(next);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!mountRef.current) return;
    const mount = mountRef.current;
    let cancelled = false;
    setAudioReady(false);
    audioRef.current = null;
    setActiveMap(mapId);
    setWorldLoading(false);
    setCurrentBiome(getActiveMap().displayBiome);

    const W = () => mount.clientWidth  || window.innerWidth;
    const H = () => mount.clientHeight || window.innerHeight;

    const tileResForQuality = (q: QualityTier) =>
      q === "low" ? 32 : q === "medium" ? 40 : q === "high" ? 48 : 56;

    // ── Renderer ──────────────────────────────────────────────────────────────
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        powerPreference: "high-performance",
        alpha: false,
      });
    } catch {
      const msg = document.createElement("div");
      msg.style.cssText = "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#fff;font-size:18px;background:#000;text-align:center;padding:24px;";
      msg.textContent = "WebGL is not available in this environment. Please open this game in a modern desktop browser.";
      mount.appendChild(msg);
      return;
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    renderer.setSize(W(), H());
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
    renderer.toneMapping       = THREE.ACESFilmicToneMapping;
    const mapInit = getActiveMap();
    renderer.toneMappingExposure = mapInit.exposure;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(mapInit.fogColor, 1);
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    mount.appendChild(renderer.domElement);

    const unlockOnPointer = () => {
      if (cancelled || !audioRef.current) return;
      void audioRef.current.unlock().then(() => { if (!cancelled) setAudioReady(true); });
    };
    mount.addEventListener("pointerdown", unlockOnPointer);

    const scene  = new THREE.Scene();
    scene.background = new THREE.Color(mapInit.fogColor);
    scene.fog    = new THREE.FogExp2(mapInit.fogColor, mapInit.fogDensity);

    const camera = new THREE.PerspectiveCamera(62, W() / H(), 0.5, 2500);
    camera.position.set(0, 5, -11);

    // postFx declared here so onResize can reference it (assigned later after scene/lights exist)
    let postFxRef: ReturnType<typeof createPostFx> | null = null;

    const onResize = () => {
      const w = Math.max(1, W());
      const h = Math.max(1, H());
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      postFxRef?.setSize(w, h);
    };
    window.addEventListener("resize", onResize);

    // ── Path state ────────────────────────────────────────────────────────────
    const { ensurePath, samplePath, normalFromH, isNearRoad, setAnchor } = createPathState();

    // ── Ground tiles ──────────────────────────────────────────────────────────
    const groundTiles: { mesh: THREE.Mesh; tx: number; tz: number }[] = [];
    const groundMat = new THREE.MeshStandardMaterial({
      roughness: 0.94,
      metalness: 0.02,
      vertexColors: true,
      envMapIntensity: 0.35,
    });

    let tileRes = tileResForQuality(qualityRef.current);

    const makeGroundTile = (tx: number, tz: number) => {
      const geo    = new THREE.PlaneGeometry(TILE_SIZE, TILE_SIZE, tileRes, tileRes);
      geo.rotateX(-Math.PI / 2);
      const pos    = geo.attributes.position as THREE.BufferAttribute;
      const colors = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        const wx = pos.getX(i) + tx * TILE_SIZE;
        const wz = pos.getZ(i) + tz * TILE_SIZE;
        const hy = Math.max(0, terrainHeight(wx, wz));
        pos.setY(i, hy);
        let r: number, g: number, b: number;
        if (isOnRoad(wx, wz, ROAD_HALF + 1)) {
          r = 0.14; g = 0.14; b = 0.15;
        } else if (isOnSidewalk(wx, wz)) {
          r = 0.22; g = 0.21; b = 0.20;
        } else {
          const bw = biomeWeightsAt(wx, wz);
          const gc = getGroundColorAt(wx, wz, hy, bw);
          r = gc.r; g = gc.g; b = gc.b;
        }
        colors[i * 3]     = r;
        colors[i * 3 + 1] = g;
        colors[i * 3 + 2] = b;
      }
      geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      geo.computeVertexNormals();

      // Second pass: slope-based rock tint + altitude snow using computed normals
      const norms = geo.attributes.normal as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const ny  = norms.getY(i);          // 1 = flat, 0 = vertical cliff
        const hy  = pos.getY(i);
        // Steep slope → grey rock
        const rock = Math.min(1, Math.max(0, (1 - ny) * 3.0 - 0.35));
        // High & flat → snow
        const snowLine = getActiveMap().snowLine;
        const snow = Math.min(1, Math.max(0, (hy - snowLine) / 20) * ny * 2.4);

        let r = colors[i * 3], g = colors[i * 3 + 1], b = colors[i * 3 + 2];
        r = r + (0.36 - r) * rock;  g = g + (0.30 - g) * rock;  b = b + (0.28 - b) * rock;
        r = r + (0.94 - r) * snow;  g = g + (0.96 - g) * snow;  b = b + (1.00 - b) * snow;
        colors[i * 3] = r; colors[i * 3 + 1] = g; colors[i * 3 + 2] = b;
      }
      (geo.attributes.color as THREE.BufferAttribute).needsUpdate = true;

      const mesh = new THREE.Mesh(geo, groundMat);
      mesh.receiveShadow = true;
      mesh.position.set(tx * TILE_SIZE, 0, tz * TILE_SIZE);
      scene.add(mesh);
      return { mesh, tx, tz };
    };

    const updateGroundTiles = (px: number, pz: number) => {
      const cx   = Math.round(px / TILE_SIZE);
      const cz   = Math.round(pz / TILE_SIZE);
      const half = Math.floor(TILE_GRID / 2);
      const needed = new Set<string>();
      for (let dx = -half; dx <= half; dx++)
        for (let dz = -half; dz <= half; dz++)
          needed.add(`${cx + dx},${cz + dz}`);
      for (let i = groundTiles.length - 1; i >= 0; i--) {
        const t = groundTiles[i];
        const key = `${t.tx},${t.tz}`;
        if (!needed.has(key)) { scene.remove(t.mesh); t.mesh.geometry.dispose(); groundTiles.splice(i, 1); }
        else needed.delete(key);
      }
      needed.forEach(k => {
        const [tx, tz] = k.split(",").map(Number);
        groundTiles.push(makeGroundTile(tx, tz));
      });
    };

    ensurePath(1200);
    updateGroundTiles(0, 0);

    // ── Sea plane ─────────────────────────────────────────────────────────────
    const seaGeo  = new THREE.PlaneGeometry(7000, 7000, 1, 1);
    seaGeo.rotateX(-Math.PI / 2);
    const seaMat  = new THREE.MeshStandardMaterial({
      color: mapInit.seaColor, roughness: 0.06, metalness: 0.72,
      transparent: true, opacity: 0.92,
      envMapIntensity: 1.4,
    });
    const seaMesh = new THREE.Mesh(seaGeo, seaMat);
    seaMesh.position.y = mapInit.seaLevel;
    seaMesh.visible = mapInit.seaVisible;
    seaMesh.receiveShadow = true;
    scene.add(seaMesh);

    // ── Road geometry helpers ─────────────────────────────────────────────────
    const makeRoadGeo = () => {
      const g   = new THREE.BufferGeometry();
      const pos = new Float32Array(ROAD_TOTAL * 3);
      const uv  = new Float32Array(ROAD_TOTAL * 2);
      const idx: number[] = [];
      for (let i = 0; i < ROAD_SEGS; i++) {
        const a = i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      return g;
    };

    const roadGeo     = makeRoadGeo();
    const shoulderGeo = makeRoadGeo();
    const clGeo       = makeRoadGeo();
    const laneGeoL    = makeRoadGeo();
    const laneGeoR    = makeRoadGeo();

    const roadMat    = new THREE.MeshStandardMaterial({
      color: mapInit.roadColor, roughness: 0.72, metalness: 0.12,
    });
    const shoulderMat= new THREE.MeshStandardMaterial({
      color: mapInit.shoulderColor, roughness: 0.96, metalness: 0.04,
    });
    const clMat      = new THREE.MeshStandardMaterial({
      color: 0xf1d873, emissive: new THREE.Color(0xf1d873), emissiveIntensity: 0.1, roughness: 0.6,
    });
    const laneMat    = new THREE.MeshStandardMaterial({
      color: 0xffffff, emissive: new THREE.Color(0xffffff), emissiveIntensity: 0.06, roughness: 0.75,
    });

    // Old spline-road meshes kept for disposal but hidden — grid road renderer takes over
    const oldRoadMeshes = [
      new THREE.Mesh(shoulderGeo, shoulderMat),
      new THREE.Mesh(roadGeo, roadMat),
      new THREE.Mesh(clGeo, clMat),
      new THREE.Mesh(laneGeoL, laneMat),
      new THREE.Mesh(laneGeoR, laneMat),
    ];
    oldRoadMeshes.forEach(m => { m.visible = false; scene.add(m); });

    const updateRoad = (vs: VehicleState) => {
      const start = vs.s - 40;
      const p  = roadGeo.getAttribute("position") as THREE.BufferAttribute;
      const u  = roadGeo.getAttribute("uv") as THREE.BufferAttribute;
      const sp = shoulderGeo.getAttribute("position") as THREE.BufferAttribute;
      const cl = clGeo.getAttribute("position") as THREE.BufferAttribute;
      const ll = laneGeoL.getAttribute("position") as THREE.BufferAttribute;
      const lr = laneGeoR.getAttribute("position") as THREE.BufferAttribute;

      for (let i = 0; i <= ROAD_SEGS; i++) {
        const s    = start + i * ROAD_STEP;
        const samp = samplePath(s);
        const n    = normalFromH(samp.h);
        const ry   = Math.max(0, terrainHeight(samp.x, samp.z)) + 0.06;

        p.setXYZ(i * 2,     samp.x + n.x * RW, ry,        samp.z + n.z * RW);
        p.setXYZ(i * 2 + 1, samp.x - n.x * RW, ry,        samp.z - n.z * RW);
        u.setXY(i * 2, 0, s * 0.04);
        u.setXY(i * 2 + 1, 1, s * 0.04);

        const sw = RW + 2.6;
        sp.setXYZ(i * 2,     samp.x + n.x * sw, ry - 0.02, samp.z + n.z * sw);
        sp.setXYZ(i * 2 + 1, samp.x - n.x * sw, ry - 0.02, samp.z - n.z * sw);

        const clw = Math.floor(s / 5) % 2 === 0 ? 0.11 : 0;
        cl.setXYZ(i * 2,     samp.x + n.x * clw, ry + 0.028, samp.z + n.z * clw);
        cl.setXYZ(i * 2 + 1, samp.x - n.x * clw, ry + 0.028, samp.z - n.z * clw);

        const hw = RW * 0.62;
        const ld = Math.floor(s / 8) % 2 === 0 ? 0.09 : 0;
        ll.setXYZ(i * 2,     samp.x + n.x * (hw + ld), ry + 0.02, samp.z + n.z * (hw + ld));
        ll.setXYZ(i * 2 + 1, samp.x + n.x * (hw - ld), ry + 0.02, samp.z + n.z * (hw - ld));
        lr.setXYZ(i * 2,     samp.x - n.x * (hw + ld), ry + 0.02, samp.z - n.z * (hw + ld));
        lr.setXYZ(i * 2 + 1, samp.x - n.x * (hw - ld), ry + 0.02, samp.z - n.z * (hw - ld));
      }
      [p, u, sp, cl, ll, lr].forEach(a => { a.needsUpdate = true; });
      [roadGeo, shoulderGeo, clGeo, laneGeoL, laneGeoR].forEach(g => {
        g.computeVertexNormals();
        g.computeBoundingSphere();
      });
    };

    // ── Guardrails ────────────────────────────────────────────────────────────
    const railMat = new THREE.MeshStandardMaterial({ color: 0xbbbbbb, metalness: 0.85, roughness: 0.2 });
    const makeRailGeo = () => {
      const g   = new THREE.BufferGeometry();
      const pos = new Float32Array(RAIL_TOTAL * 3);
      const idx: number[] = [];
      for (let i = 0; i < RAIL_SEGS; i++) {
        const a = i * 2;
        idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      return g;
    };
    const railGeoL = makeRailGeo(), railGeoR = makeRailGeo();
    const railMeshL = new THREE.Mesh(railGeoL, railMat);
    const railMeshR = new THREE.Mesh(railGeoR, railMat);
    railMeshL.visible = false; railMeshR.visible = false;
    scene.add(railMeshL); scene.add(railMeshR);

    const updateGuardrails = (vs: VehicleState) => {
      const start = vs.s - 20;
      const posL  = railGeoL.getAttribute("position") as THREE.BufferAttribute;
      const posR  = railGeoR.getAttribute("position") as THREE.BufferAttribute;
      for (let i = 0; i <= RAIL_SEGS; i++) {
        const s    = start + i * RAIL_STEP;
        const samp = samplePath(s);
        const n    = normalFromH(samp.h);
        const ry   = Math.max(0, terrainHeight(samp.x, samp.z)) + 0.68;
        const ow   = RW + 3.4;
        posL.setXYZ(i * 2,     samp.x + n.x * ow, ry,        samp.z + n.z * ow);
        posL.setXYZ(i * 2 + 1, samp.x + n.x * ow, ry + 0.32, samp.z + n.z * ow);
        posR.setXYZ(i * 2,     samp.x - n.x * ow, ry,        samp.z - n.z * ow);
        posR.setXYZ(i * 2 + 1, samp.x - n.x * ow, ry + 0.32, samp.z - n.z * ow);
      }
      posL.needsUpdate = true;
      posR.needsUpdate = true;
      railGeoL.computeBoundingSphere();
      railGeoR.computeBoundingSphere();
    };

    // ── Clouds — 3-layer volumetric puff clusters + high cirrus ──────────────
    const cloudSphereGeo = new THREE.SphereGeometry(1, 8, 6);
    const cloudMat = new THREE.MeshStandardMaterial({
      color: 0xdce8f2, transparent: true, opacity: 0, depthWrite: false, roughness: 1,
    });
    const cloudMatB = new THREE.MeshStandardMaterial({
      color: 0xcfdbe8, transparent: true, opacity: 0, depthWrite: false, roughness: 1,
    });
    const cloudMatC = new THREE.MeshStandardMaterial({
      color: 0xd8e2ec, transparent: true, opacity: 0, depthWrite: false, roughness: 1,
    });
    // Three overlapping sphere sets per cloud position → puffy cumulus look
    const cloudMeshA = new THREE.InstancedMesh(cloudSphereGeo,         cloudMat,  CLOUD_COUNT);
    const cloudMeshB = new THREE.InstancedMesh(cloudSphereGeo.clone(), cloudMatB, CLOUD_COUNT);
    const cloudMeshC = new THREE.InstancedMesh(cloudSphereGeo.clone(), cloudMatC, CLOUD_COUNT);
    scene.add(cloudMeshA); scene.add(cloudMeshB); scene.add(cloudMeshC);

    // High-altitude cirrus (always faintly visible, very thin)
    const cirrusMat  = new THREE.MeshStandardMaterial({
      color: 0xeef5ff, transparent: true, opacity: 0.14, depthWrite: false, roughness: 1,
    });
    const cirrusMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 6, 4), cirrusMat, CIRRUS_COUNT);
    scene.add(cirrusMesh);

    const cloudOffsets = Array.from({ length: CLOUD_COUNT }, () => ({
      x: (Math.random() - 0.5) * 1200,
      z: (Math.random() - 0.5) * 1200,
      y: 75 + Math.random() * 60,
      s: 28 + Math.random() * 50,
      speed: 0.4 + Math.random() * 1.1,
    }));
    const cirrusOffsets = Array.from({ length: CIRRUS_COUNT }, () => ({
      x: (Math.random() - 0.5) * 2400,
      z: (Math.random() - 0.5) * 2400,
      y: 320 + Math.random() * 130,
      sx: 180 + Math.random() * 340,
      sz: 55  + Math.random() * 110,
      speed: 0.6 + Math.random() * 1.8,
    }));
    const cloudDummy = new THREE.Object3D();

    const updateClouds = (vs: VehicleState, wx: string, dt: number) => {
      const visible = wx === "cloudy" || wx === "rain" || wx === "thunder";
      const tgt = visible ? 0.88 : 0.0;
      cloudMat.opacity  += (tgt          - cloudMat.opacity)  * 0.05;
      cloudMatB.opacity += (tgt * 0.80   - cloudMatB.opacity) * 0.05;
      cloudMatC.opacity += (tgt * 0.65   - cloudMatC.opacity) * 0.05;

      for (let i = 0; i < CLOUD_COUNT; i++) {
        const o  = cloudOffsets[i];
        o.x += o.speed * dt;
        if (o.x > 700) o.x = -700;
        const bx = vs.worldPos.x + o.x;
        const by = o.y;
        const bz = vs.worldPos.z + o.z;
        const s  = o.s;
        // Main body
        cloudDummy.position.set(bx, by, bz);
        cloudDummy.scale.set(s, s * 0.38, s);
        cloudDummy.updateMatrix(); cloudMeshA.setMatrixAt(i, cloudDummy.matrix);
        // Second puff — shifted right-forward, taller
        cloudDummy.position.set(bx + s * 0.44, by + s * 0.14, bz + s * 0.08);
        cloudDummy.scale.set(s * 0.74, s * 0.46, s * 0.74);
        cloudDummy.updateMatrix(); cloudMeshB.setMatrixAt(i, cloudDummy.matrix);
        // Third puff — shifted left-back, also taller
        cloudDummy.position.set(bx - s * 0.34, by + s * 0.18, bz - s * 0.06);
        cloudDummy.scale.set(s * 0.60, s * 0.44, s * 0.60);
        cloudDummy.updateMatrix(); cloudMeshC.setMatrixAt(i, cloudDummy.matrix);
      }
      cloudMeshA.instanceMatrix.needsUpdate = true;
      cloudMeshB.instanceMatrix.needsUpdate = true;
      cloudMeshC.instanceMatrix.needsUpdate = true;

      // Cirrus — always partially visible regardless of weather
      for (let i = 0; i < CIRRUS_COUNT; i++) {
        const c = cirrusOffsets[i];
        c.x += c.speed * dt;
        if (c.x > 1600) c.x = -1600;
        cloudDummy.position.set(vs.worldPos.x + c.x, c.y, vs.worldPos.z + c.z);
        cloudDummy.scale.set(c.sx, c.sx * 0.025, c.sz);
        cloudDummy.updateMatrix(); cirrusMesh.setMatrixAt(i, cloudDummy.matrix);
      }
      cirrusMesh.instanceMatrix.needsUpdate = true;
    };

    // ── Atmospheric scattering sky shader ────────────────────────────────────
    const zenithUniform = new THREE.Color(mapInit.skyZenith);
    const horizonUniform = new THREE.Color(mapInit.skyHorizon);
    const skyMat = new THREE.ShaderMaterial({
      uniforms: {
        sunDir:        { value: new THREE.Vector3(0, 1, 0) },
        daylight:      { value: 1.0 },
        zenithColor:   { value: zenithUniform },
        horizonColor:  { value: horizonUniform },
      },
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3  sunDir;
        uniform float daylight;
        uniform vec3  zenithColor;
        uniform vec3  horizonColor;
        varying vec3  vDir;

        void main() {
          vec3 dir = normalize(vDir);
          float elev    = dir.y;
          float sunDot  = dot(dir, normalize(sunDir));

          vec3 night = vec3(0.004, 0.007, 0.030);

          float t = clamp(elev * 1.6 + 0.25, 0.0, 1.0);
          vec3 daySky = mix(horizonColor, zenithColor, t);

          // ── Blend day/night ──
          vec3 sky = mix(night, daySky, daylight);

          // ── Sunset / sunrise glow at horizon ──
          float sunElev    = sunDir.y;
          float horizonFac = pow(clamp(1.0 - abs(elev) * 3.5, 0.0, 1.0), 2.5);
          float twilight   = clamp(1.0 - abs(sunElev) * 3.8, 0.0, 1.0);
          float dawnBias   = clamp(sunElev * 4.0, -1.0, 1.0) * 0.5 + 0.5; // 0=dusk 1=dawn
          vec3  duskColor  = mix(vec3(0.95, 0.22, 0.04), vec3(1.00, 0.55, 0.20), t);
          vec3  dawnColor  = mix(vec3(1.00, 0.48, 0.18), vec3(1.00, 0.78, 0.50), t);
          vec3  twColor    = mix(duskColor, dawnColor, dawnBias);
          sky = mix(sky, twColor * max(daylight, 0.12), horizonFac * twilight * 0.88);

          // ── Mie scattering: sun halo and wide glow ──
          float mieWide   = pow(max(0.0, sunDot), 2.5) * 0.08;
          float mieMed    = pow(max(0.0, sunDot), 10.0) * 0.40;
          float mieNarrow = pow(max(0.0, sunDot), 60.0) * 1.20;
          vec3  sunColor  = mix(vec3(1.0, 0.42, 0.10), vec3(1.0, 0.97, 0.88),
                                clamp(sunDir.y * 2.8, 0.0, 1.0));
          sky += sunColor * (mieWide + mieMed + mieNarrow) * max(0.12, daylight);

          // ── Dim below horizon ──
          sky *= clamp(1.0 - max(0.0, -elev) * 6.0, 0.0, 1.0);

          gl_FragColor = vec4(max(vec3(0.0), sky), 1.0);
        }
      `,
      side: THREE.BackSide,
      depthWrite: false,
    });
    const skyDome = new THREE.Mesh(new THREE.SphereGeometry(1900, 32, 20), skyMat);
    scene.add(skyDome);

    // Sun disc with a soft glow sprite behind it
    const sunMesh  = new THREE.Mesh(
      new THREE.SphereGeometry(24, 20, 20),
      new THREE.MeshBasicMaterial({ color: 0xfffde8 }),
    );
    const sunGlow  = new THREE.Mesh(
      new THREE.SphereGeometry(48, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xff9933, transparent: true, opacity: 0.18, depthWrite: false }),
    );
    const moonMesh = new THREE.Mesh(
      new THREE.SphereGeometry(16, 18, 18),
      new THREE.MeshBasicMaterial({ color: 0xdde8f5 }),
    );
    scene.add(sunGlow); scene.add(sunMesh); scene.add(moonMesh);

    // ── Stars with colour tints ────────────────────────────────────────────
    const starGeo      = new THREE.BufferGeometry();
    const starPosArr   = new Float32Array(STAR_COUNT * 3);
    const starColorArr = new Float32Array(STAR_COUNT * 3);
    const starColors   = [
      [1.0, 0.92, 0.80], // warm white
      [0.85, 0.90, 1.00], // blue-white
      [1.00, 0.95, 0.70], // yellow
      [1.00, 0.75, 0.60], // orange
      [1.00, 1.00, 1.00], // pure white
    ];
    for (let i = 0; i < STAR_COUNT; i++) {
      const theta = Math.random() * TWO_PI;
      const phi   = Math.acos(2 * Math.random() - 1);
      const r     = 1600;
      starPosArr[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
      starPosArr[i * 3 + 1] = Math.abs(r * Math.cos(phi)) + 50;
      starPosArr[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
      const c = starColors[Math.floor(Math.random() * starColors.length)];
      starColorArr[i * 3] = c[0]; starColorArr[i * 3 + 1] = c[1]; starColorArr[i * 3 + 2] = c[2];
    }
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPosArr, 3));
    starGeo.setAttribute("color",    new THREE.BufferAttribute(starColorArr, 3));
    const starMat = new THREE.PointsMaterial({
      size: 2.4, sizeAttenuation: true, transparent: true, opacity: 0,
      vertexColors: true, depthWrite: false,
    });
    const stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);

    const sunVector = (t: number) => {
      const angle = (t - 0.25) * TWO_PI;
      return new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0.22).normalize();
    };

    // ── Lighting ──────────────────────────────────────────────────────────────
    const ambLight  = new THREE.AmbientLight(0xc8d8ff, 0.38);
    const hemiLight = new THREE.HemisphereLight(0x9ec4ff, 0x6a5a42, 0.78);
    const dirLight  = new THREE.DirectionalLight(0xfff6e0, 2.6);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(2048, 2048);
    dirLight.shadow.camera.left = dirLight.shadow.camera.bottom = -130;
    dirLight.shadow.camera.right = dirLight.shadow.camera.top  =  130;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far  = 500;
    dirLight.shadow.bias        = -0.00008;
    dirLight.shadow.normalBias  = 0.018;

    let city: ReturnType<typeof createCity> | null = null;

    const applyQualitySettings = (q: QualityTier) => {
      const pr = q === "low" ? 1 : q === "medium" ? 1.25 : q === "high" ? 1.5 : 2;
      renderer.setPixelRatio(Math.min(devicePixelRatio, pr));
      const shadowSize = q === "low" ? 1024 : q === "medium" ? 2048 : 4096;
      dirLight.shadow.mapSize.set(shadowSize, shadowSize);
      const ext = q === "low" ? 90 : 130;
      dirLight.shadow.camera.left = dirLight.shadow.camera.bottom = -ext;
      dirLight.shadow.camera.right = dirLight.shadow.camera.top = ext;
      tileRes = tileResForQuality(q);
      city?.setQuality(q);
    };
    applyQualitySettings(qualityRef.current);

    scene.add(ambLight); scene.add(hemiLight);
    scene.add(dirLight); scene.add(dirLight.target);

    const cityNightLight = new THREE.HemisphereLight(0x3a5080, 0x1a1408, 0);
    scene.add(cityNightLight);

    const initW = Math.max(1, W());
    const initH = Math.max(1, H());
    const useBloom = qualityRef.current !== "low";
    let postFx = createPostFx(renderer, scene, camera, initW, initH, mapInit.bloomStrength, useBloom);
    postFxRef = postFx;
    const gameAudio = createGameAudio();
    audioRef.current = gameAudio;

    const headL = new THREE.SpotLight(0xfff4cc, 0, 90, 0.52, 0.38, 1.2);
    const headR = new THREE.SpotLight(0xfff4cc, 0, 90, 0.52, 0.38, 1.2);
    const headTarget = new THREE.Object3D();
    headL.target = headTarget; headR.target = headTarget;
    scene.add(headL); scene.add(headR); scene.add(headTarget);

    // ── Improved Rain (line geometry for streaks) ─────────────────────────────
    const rainPosArr   = new Float32Array(RAIN_COUNT * 6);
    const rainVel      = new Float32Array(RAIN_COUNT);
    const rainBasePos  = new Float32Array(RAIN_COUNT * 3);
    for (let i = 0; i < RAIN_COUNT; i++) {
      const x = (Math.random() - 0.5) * 130;
      const y = Math.random() * 55;
      const z = (Math.random() - 0.5) * 130;
      rainBasePos[i * 3] = x; rainBasePos[i * 3 + 1] = y; rainBasePos[i * 3 + 2] = z;
      rainPosArr[i * 6]     = x; rainPosArr[i * 6 + 1] = y; rainPosArr[i * 6 + 2] = z;
      rainPosArr[i * 6 + 3] = x; rainPosArr[i * 6 + 4] = y - 0.7; rainPosArr[i * 6 + 5] = z;
      rainVel[i] = 42 + Math.random() * 30;
    }
    const rainGeo    = new THREE.BufferGeometry();
    rainGeo.setAttribute("position", new THREE.BufferAttribute(rainPosArr, 3));
    const rainIdx: number[] = [];
    for (let i = 0; i < RAIN_COUNT; i++) { rainIdx.push(i * 2, i * 2 + 1); }
    rainGeo.setIndex(rainIdx);
    const rainMat    = new THREE.LineBasicMaterial({ color: 0xadd4f0, transparent: true, opacity: 0 });
    const rainLines  = new THREE.LineSegments(rainGeo, rainMat);
    scene.add(rainLines);

    const updateRain = (vs: VehicleState, wx: string, dt: number) => {
      const active = wx === "rain" || wx === "thunder";
      rainMat.opacity += (active ? 0.55 : -rainMat.opacity) * 0.1;
      if (!active) return;
      rainLines.position.x = vs.worldPos.x;
      rainLines.position.z = vs.worldPos.z;
      const arr = rainGeo.attributes.position.array as Float32Array;
      for (let i = 0; i < RAIN_COUNT; i++) {
        arr[i * 6 + 1] -= rainVel[i] * dt;
        arr[i * 6 + 4] -= rainVel[i] * dt;
        if (arr[i * 6 + 1] < 0) {
          const x = (Math.random() - 0.5) * 130;
          const z = (Math.random() - 0.5) * 130;
          const y = 55 + Math.random() * 12;
          arr[i * 6] = x; arr[i * 6 + 1] = y; arr[i * 6 + 2] = z;
          arr[i * 6 + 3] = x; arr[i * 6 + 4] = y - 0.7; arr[i * 6 + 5] = z;
        }
      }
      rainGeo.attributes.position.needsUpdate = true;
    };

    // ── Snow ──────────────────────────────────────────────────────────────────
    const snowFlakeGeo    = new THREE.BufferGeometry();
    const snowFlakePosArr = new Float32Array(SNOW_COUNT * 3);
    for (let i = 0; i < SNOW_COUNT; i++) {
      snowFlakePosArr[i * 3]     = (Math.random() - 0.5) * 100;
      snowFlakePosArr[i * 3 + 1] = Math.random() * 50;
      snowFlakePosArr[i * 3 + 2] = (Math.random() - 0.5) * 100;
    }
    snowFlakeGeo.setAttribute("position", new THREE.BufferAttribute(snowFlakePosArr, 3));
    const snowFlakeMat  = new THREE.PointsMaterial({ color: 0xeef8ff, size: 0.38, transparent: true, opacity: 0, sizeAttenuation: true, depthWrite: false });
    const snowPoints    = new THREE.Points(snowFlakeGeo, snowFlakeMat);
    scene.add(snowPoints);

    const updateSnow = (vs: VehicleState, bwArr: BiomeWeights, dt: number) => {
      const snowing = bwArr.tundra > 0.4;
      snowFlakeMat.opacity += (snowing ? 0.72 : -snowFlakeMat.opacity) * 0.05;
      if (!snowing) return;
      snowPoints.position.x = vs.worldPos.x; snowPoints.position.z = vs.worldPos.z;
      const arr = snowFlakeGeo.attributes.position.array as Float32Array;
      for (let i = 0; i < SNOW_COUNT; i++) {
        arr[i * 3 + 1] -= 5 * dt;
        arr[i * 3]     += Math.sin(Date.now() * 0.001 + i) * 0.5 * dt;
        if (arr[i * 3 + 1] < 0) {
          arr[i * 3]     = (Math.random() - 0.5) * 100;
          arr[i * 3 + 1] = 50;
          arr[i * 3 + 2] = (Math.random() - 0.5) * 100;
        }
      }
      snowFlakeGeo.attributes.position.needsUpdate = true;
    };

    // ── Car ───────────────────────────────────────────────────────────────────
    interface VehicleState {
      s: number; speed: number; wheelAngle: number;
      worldPos: THREE.Vector3; heading: number; gear: number;
      pitch: number; slipAngle: number;
    }
    const vs: VehicleState = {
      s: 0, speed: 0, wheelAngle: 0,
      worldPos: new THREE.Vector3(0, 0.5, 0), heading: 0, gear: 1,
      pitch: 0, slipAngle: 0,
    };
    const MAX_STEER = 0.52;
    const WHEEL_BASE = 2.65;
    let gameTimeSec = 0;
    const camPos    = new THREE.Vector3(0, 5, -11);
    const camTarget = new THREE.Vector3();
    const carGroup  = new THREE.Group();
    scene.add(carGroup);

    const makePart = (geo: THREE.BufferGeometry, color: number, metalness: number, roughness: number, emissive?: number, emInt = 0) => {
      const mat = new THREE.MeshStandardMaterial({ color, metalness, roughness });
      if (emissive !== undefined) { mat.emissive = new THREE.Color(emissive); mat.emissiveIntensity = emInt; }
      const m = new THREE.Mesh(geo, mat); m.castShadow = true; return m;
    };

    const bodyBot     = makePart(new THREE.BoxGeometry(1.92, 0.38, 4.55), 0xb3261e, 0.72, 0.22); bodyBot.position.set(0, 0.5, 0);
    const bodyMid     = makePart(new THREE.BoxGeometry(1.84, 0.28, 3.82), 0xb3261e, 0.70, 0.22); bodyMid.position.set(0, 0.72, -0.1);
    const bodyTop     = makePart(new THREE.BoxGeometry(1.56, 0.5, 2.22),  0x181818, 0.45, 0.16); bodyTop.position.set(0, 1.1, -0.2);
    const hood        = makePart(new THREE.BoxGeometry(1.8, 0.18, 1.42),  0xb3261e, 0.68, 0.22); hood.position.set(0, 0.68, 1.22); hood.rotation.x = 0.12;
    const bumperF     = makePart(new THREE.BoxGeometry(1.86, 0.22, 0.32), 0x1a1a1c, 0.32, 0.68); bumperF.position.set(0, 0.38, 2.27);
    const bumperR     = makePart(new THREE.BoxGeometry(1.86, 0.22, 0.32), 0x1a1a1c, 0.32, 0.68); bumperR.position.set(0, 0.38, -2.27);
    const skirtL      = makePart(new THREE.BoxGeometry(0.08, 0.18, 3.82), 0x101010, 0.42, 0.55); skirtL.position.set(0.97, 0.42, -0.1);
    const skirtR      = makePart(new THREE.BoxGeometry(0.08, 0.18, 3.82), 0x101010, 0.42, 0.55); skirtR.position.set(-0.97, 0.42, -0.1);
    const spoilerBase = makePart(new THREE.BoxGeometry(1.72, 0.08, 0.5),  0x111111, 0.5, 0.5); spoilerBase.position.set(0, 1.08, -2.12);
    const spoilerWing = makePart(new THREE.BoxGeometry(1.72, 0.22, 0.07), 0xb3261e, 0.68, 0.26); spoilerWing.position.set(0, 1.22, -2.12);
    const paintedParts: THREE.Mesh[] = [bodyBot, bodyMid, hood, spoilerWing];

    const hlMat = new THREE.MeshStandardMaterial({ color: 0xfffbe4, emissive: new THREE.Color(0xfff1a0), emissiveIntensity: 1.4, metalness: 0.35, roughness: 0.08 });
    const hlL   = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.19, 0.06), hlMat); hlL.position.set(0.67, 0.72, 2.25);
    const hlR   = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.19, 0.06), hlMat); hlR.position.set(-0.67, 0.72, 2.25);

    const tlMat = new THREE.MeshStandardMaterial({ color: 0x3a0000, emissive: new THREE.Color(0xcc1111), emissiveIntensity: 1.0, metalness: 0.12, roughness: 0.18 });
    const tlL   = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.17, 0.05), tlMat); tlL.position.set(0.72, 0.7, -2.26);
    const tlR   = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.17, 0.05), tlMat); tlR.position.set(-0.72, 0.7, -2.26);

    const winMat = new THREE.MeshStandardMaterial({ color: 0x1a2838, metalness: 0.68, roughness: 0.04, transparent: true, opacity: 0.72 });
    const winF   = new THREE.Mesh(new THREE.BoxGeometry(1.46, 0.38, 0.06), winMat); winF.position.set(0, 1.12, 0.83); winF.rotation.x = 0.15;
    const winRear= new THREE.Mesh(new THREE.BoxGeometry(1.46, 0.35, 0.06), winMat); winRear.position.set(0, 1.12, -0.66); winRear.rotation.x = -0.1;

    const wheelGeo = new THREE.CylinderGeometry(0.43, 0.43, 0.36, 22);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.92 });
    const rimGeo   = new THREE.CylinderGeometry(0.26, 0.26, 0.38, 14);
    const rimMat   = new THREE.MeshStandardMaterial({ color: 0xc8c8c8, metalness: 0.92, roughness: 0.12 });
    const wheels: THREE.Mesh[] = [], rims: THREE.Mesh[] = [];
    ([[1.04, 0.38, 1.52], [-1.04, 0.38, 1.52], [1.04, 0.38, -1.47], [-1.04, 0.38, -1.47]] as [number,number,number][]).forEach(([x, y, z]) => {
      const w   = new THREE.Mesh(wheelGeo, wheelMat); w.position.set(x, y, z); w.rotation.z = Math.PI / 2; w.castShadow = true;
      const rim = new THREE.Mesh(rimGeo,   rimMat);   rim.position.set(x, y, z); rim.rotation.z = Math.PI / 2; rim.castShadow = true;
      wheels.push(w); rims.push(rim);
      carGroup.add(w); carGroup.add(rim);
    });
    const exMat = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.82, roughness: 0.28 });
    const exL   = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.3, 9), exMat); exL.position.set(0.5, 0.32, -2.3); exL.rotation.x = Math.PI / 2;
    const exR   = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.3, 9), exMat); exR.position.set(-0.5, 0.32, -2.3); exR.rotation.x = Math.PI / 2;

    [bodyBot, bodyMid, bodyTop, hood, bumperF, bumperR, skirtL, skirtR,
     spoilerBase, spoilerWing, hlL, hlR, tlL, tlR, winF, winRear, exL, exR].forEach(m => carGroup.add(m));

    // Suspension state
    let suspBounce = 0, suspVel = 0;
    let suspPitch  = 0, suspPitchVel = 0;

    // ── Keyboard input ────────────────────────────────────────────────────────
    const keys: Record<string, boolean> = {};
    const onKeyDown = (e: KeyboardEvent) => {
      keys[e.code] = true;
      if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
      if (e.code === "Escape") setPaused(p => !p);
      if (e.code === "KeyC") {
        setCameraMode(m => m === "chase" ? "hood" : m === "hood" ? "cinematic" : "chase");
      }
      if (e.code === "KeyR") { resetRef.current = true; }
    };
    const onKeyUp = (e: KeyboardEvent) => { keys[e.code] = false; };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup",   onKeyUp);

    let vegetation: ReturnType<typeof createVegetation> | null = null;
    const peaks = createDistantPeaks(scene);
    const traffic = createTraffic(scene);
    const roadRenderer = createRoadRenderer(scene);
    const intersections = createIntersections(scene);
    const pedestrians = createPedestrians(scene);

    let flashAmt = 0, nextFlash = 3 + Math.random() * 6;
    let wheelRot = 0;
    let timeHudAccum = 0;

    try {
      const starter = createStarterAssets();
      vegetation = createVegetation(
        scene, starter, qualityRef.current, VEG_RADIUS, VEG_CELL, TWO_PI,
      );
      city = createCity(scene, starter.lamppost);
      city.setQuality(qualityRef.current);

      vegetation.update(0, 0, 0, isNearRoad);
      city.update(0, 0, 0.35);
      peaks.update(0, 0);

      if (qualityRef.current === "high" || qualityRef.current === "ultra") {
        loadHdLamppost().then((lamp) => {
          if (cancelled || !lamp) return;
          city?.upgradeLamppost(lamp);
        });
      }
    } catch (err) {
      console.error("World init failed:", err);
      const msg = document.createElement("div");
      msg.style.cssText = "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#fff;font-size:16px;background:#111;text-align:center;padding:24px;z-index:100;";
      msg.textContent = "Failed to start the world. Open the browser console (F12) for details, then refresh.";
      mount.appendChild(msg);
      return () => {
        cancelled = true;
        window.removeEventListener("resize", onResize);
        renderer.dispose();
        if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
      };
    }

    // ── Animation loop ────────────────────────────────────────────────────────
    let lastTime = 0, animId = 0;

    const animate = (now: number) => {
      animId = requestAnimationFrame(animate);
      const dt = Math.min((now - lastTime) * 0.001, 0.05);
      lastTime = now;
      if (dt <= 0) {
        postFx.render();
        return;
      }

      // Sync paint color from React state
      const currentPaint = bodyColorRef.current;
      for (const m of paintedParts) {
        const mat = m.material as THREE.MeshStandardMaterial;
        if (mat.color.getHex() !== currentPaint) mat.color.setHex(currentPaint);
      }

      if (pausedRef.current) {
        postFx.render();
        return;
      }

      if (resetRef.current) {
        resetRef.current = false;
        vs.s = 0; vs.speed = 0; vs.wheelAngle = 0; vs.slipAngle = 0;
      vs.heading = 0; vs.worldPos.set(0, 0.5, 0);
      }

      const wx = weatherRef.current;

      if (autoTimeRef.current) {
        timeRef.current = (timeRef.current + dt / 220) % 1;
        timeHudAccum += dt;
        if (timeHudAccum >= 0.35) {
          timeHudAccum = 0;
          setTimeOfDay(timeRef.current);
        }
      }

      // ── Physics ──────────────────────────────────────────────────────────
      const gasOn   = !!(keys.KeyW || keys.ArrowUp    || touchGasRef.current);
      const brakeOn = !!(keys.KeyS || keys.ArrowDown  || touchBrakeRef.current);
      const leftOn  = !!(keys.KeyA || keys.ArrowLeft  || touchLeftRef.current);
      const rightOn = !!(keys.KeyD || keys.ArrowRight || touchRightRef.current);
      const spaceOn = !!keys.Space;

      // Torque curve: more grunt in mid-range, falls off at top speed
      const spd         = Math.abs(vs.speed) * 3.6;
      const torqueFactor = Math.max(0.35, 1 - spd / (MAX_SPEED * 3.6 * 1.3));
      const accelForce   = gasOn ? 9 * torqueFactor : 0;
      const brakeForce   = brakeOn ? 11 : 0;
      const handbrake    = spaceOn ? 5.5 : 0;
      const sign         = vs.speed >= 0 ? 1 : -1;

      vs.speed += (accelForce - brakeForce * sign) * dt;
      vs.speed -= handbrake * sign * dt;
      vs.speed *= 1 - dt * (0.22 + (spaceOn ? 0.14 : 0));
      vs.speed  = Math.max(-MAX_SPEED * 0.32, Math.min(MAX_SPEED, vs.speed));

      // Gear
      vs.gear = spd < 8 ? 1 : spd < 22 ? 2 : spd < 42 ? 3 : spd < 68 ? 4 : spd < 98 ? 5 : 6;

      vs.s += Math.abs(vs.speed) * dt;
      gameTimeSec += dt;

      const steerInput = (leftOn ? 1 : 0) - (rightOn ? 1 : 0);

      // Speed-sensitive steering: full lock at low speed, reduced at highway speeds
      const spdNorm = Math.min(1, spd / (MAX_SPEED * 3.6));
      const steerMult = 1 - spdNorm * 0.55; // 100% low-speed → 45% at top
      const steerTarget = steerInput * MAX_STEER * steerMult;
      const steerSpeed = spaceOn ? 6.5 : 4.5;
      vs.wheelAngle += (steerTarget - vs.wheelAngle) * steerSpeed * dt;
      if (steerInput === 0) vs.wheelAngle *= 1 - Math.min(1, dt * 5.5);

      // Ackermann-inspired turn rate with traction saturation
      const rawTurnRate = Math.tan(vs.wheelAngle) * vs.speed / WHEEL_BASE;

      // Slip angle physics: handbrake builds slip; speed cures it; counter-steer damps it
      const slipBuild   = spaceOn ? steerInput * 0.55 * Math.sign(vs.speed) : 0;
      const slipDecay   = vs.slipAngle * (spd > 5 ? 3.8 : 1.5);     // speed-dependent grip
      const counterSteer = -vs.slipAngle * 1.8 * (steerInput === 0 ? 1 : 0.4); // auto countersteer
      vs.slipAngle += (slipBuild - slipDecay + counterSteer * spdNorm) * dt;
      vs.slipAngle  = Math.max(-0.6, Math.min(0.6, vs.slipAngle));

      // Traction ellipse: lateral grip degrades near slip limit
      const tractionMult = Math.max(0.05, 1 - Math.abs(vs.slipAngle) * 1.4);
      const turnRate = rawTurnRate * tractionMult;
      vs.heading += (turnRate + vs.slipAngle * 0.22) * dt;

      vs.worldPos.x += Math.sin(vs.heading) * vs.speed * dt;
      vs.worldPos.z += Math.cos(vs.heading) * vs.speed * dt;

      vs.worldPos.y = carAnchorY(vs.worldPos.x, vs.worldPos.z);
      setAnchor(vs.worldPos.x, vs.worldPos.z, vs.heading);

      // Weight transfer pitch (nose dips on brake, raises on gas)
      const pitchTarget = (brakeOn ? 0.06 : gasOn ? -0.04 : 0) + (spaceOn ? 0.03 : 0);
      suspPitchVel += (pitchTarget - suspPitch) * 14 * dt;
      suspPitchVel *= 0.75;
      suspPitch    += suspPitchVel * dt;

      // Vertical suspension
      const targetSusp = Math.abs(vs.speed) > 0.5 ? (Math.random() - 0.5) * 0.055 : 0;
      suspVel += (targetSusp - suspBounce) * 14 * dt;
      suspVel *= 0.78;
      suspBounce += suspVel;

      carGroup.position.copy(vs.worldPos); carGroup.position.y += suspBounce;
      carGroup.rotation.y = vs.heading + vs.slipAngle;
      carGroup.rotation.x = suspPitch;

      wheelRot += vs.speed * dt * 0.72;
      wheels.forEach((w, i) => {
        w.rotation.x   = wheelRot; rims[i].rotation.x = wheelRot;
        if (i < 2) { w.rotation.y = -vs.wheelAngle * 2.2; rims[i].rotation.y = -vs.wheelAngle * 2.2; }
      });

      // ── Camera ───────────────────────────────────────────────────────────
      const camMode = cameraModeRef.current;
      const camH    = vs.heading;
      let camHeight = 3.6 + Math.abs(vs.speed) * 0.06;
      let camDist   = 9.5 + Math.abs(vs.speed) * 0.15;
      let camFOV    = 62 + Math.min(12, spd * 0.1);
      if (camMode === "hood") {
        camHeight = 1.38; camDist = -2.0; camFOV = 78;
      } else if (camMode === "cinematic") {
        camHeight = 5.5 + Math.abs(vs.speed) * 0.08; camDist = 16; camFOV = 50;
      }
      if (Math.abs(camera.fov - camFOV) > 0.1) {
        camera.fov += (camFOV - camera.fov) * dt * 4;
        camera.updateProjectionMatrix();
      }
      const desired = new THREE.Vector3(
        vs.worldPos.x - Math.sin(camH) * camDist,
        vs.worldPos.y + camHeight,
        vs.worldPos.z - Math.cos(camH) * camDist,
      );
      camPos.lerp(desired, Math.min(1, dt * (camMode === "hood" ? 12 : 5.2)));
      camera.position.copy(camPos);

      const lookDist = camMode === "cinematic" ? 32 : 18;
      const la = samplePath(lookDist);
      camTarget.lerp(new THREE.Vector3(la.x, vs.worldPos.y + 1.2, la.z), Math.min(1, dt * 8));
      camera.lookAt(camTarget);

      // ── Sky / Lighting ───────────────────────────────────────────────────
      const sun      = sunVector(timeRef.current);
      const elev     = sun.y;
      const daylight = THREE.MathUtils.clamp(elev * 1.4 + 0.15, 0, 1);
      const overcast = wx === "cloudy" ? 0.52 : wx === "rain" ? 0.38 : wx === "thunder" ? 0.28 : 1;

      const map = getActiveMap();
      const bw  = biomeWeightsAt(vs.worldPos.x, vs.worldPos.z);
      const dom = dominantBiome(bw);
      const biome = BIOMES[dom];

      skyMat.uniforms.daylight.value = daylight;
      skyMat.uniforms.sunDir.value.copy(sun);
      zenithUniform.setHex(map.skyZenith);
      horizonUniform.setHex(map.skyHorizon);

      const fogC = new THREE.Color(0x06121f).lerp(new THREE.Color(map.fogColor), daylight);
      if (wx === "rain" || wx === "thunder") fogC.lerp(new THREE.Color(0x4e5c68), 0.55);
      if (wx === "cloudy") fogC.lerp(new THREE.Color(0x96a2ad), 0.42);

      const sunDist = 850;
      const isVisible = sun.y > -0.05;
      sunMesh.position.set(vs.worldPos.x + sun.x * sunDist, vs.worldPos.y + sun.y * sunDist, vs.worldPos.z + sun.z * sunDist);
      sunGlow.position.copy(sunMesh.position);
      sunMesh.visible = sunGlow.visible = isVisible;
      // Tint sun from orange (dawn/dusk) to white (noon)
      const sunTint = new THREE.Color(0xff8833).lerp(new THREE.Color(0xfffde8), THREE.MathUtils.clamp(elev * 3, 0, 1));
      (sunMesh.material as THREE.MeshBasicMaterial).color.copy(sunTint);
      (sunGlow.material as THREE.MeshBasicMaterial).color.setHex(0xff7700).lerp(new THREE.Color(0xffddaa), THREE.MathUtils.clamp(elev * 3, 0, 1));
      const moonDir = sun.clone().negate();
      moonMesh.position.set(vs.worldPos.x + moonDir.x * sunDist, vs.worldPos.y + moonDir.y * sunDist, vs.worldPos.z + moonDir.z * sunDist);
      moonMesh.visible = moonDir.y > 0.05;
      starMat.opacity = THREE.MathUtils.clamp((1 - daylight) * 1.5 - 0.05, 0, 1);
      stars.position.copy(vs.worldPos);
      skyDome.position.copy(vs.worldPos);

      seaMat.color.setHex(map.seaColor);
      seaMat.color.offsetHSL(0, 0, (daylight - 0.5) * 0.08);
      seaMesh.position.x = vs.worldPos.x;
      seaMesh.position.z = vs.worldPos.z;
      seaMesh.position.y = map.seaLevel;
      seaMesh.visible = map.seaVisible;

      renderer.toneMappingExposure += (map.exposure - renderer.toneMappingExposure) * dt * 0.5;
      scene.background = new THREE.Color(map.fogColor);

      const warm = map.sunWarmth;
      const sunColor = new THREE.Color(0xff6600).lerp(
        new THREE.Color(0xfff4e0),
        THREE.MathUtils.clamp(elev * 2.5 * warm, 0, 1),
      );
      dirLight.intensity = daylight * 2.5 * overcast + flashAmt * 9;
      dirLight.color.copy(sunColor);
      dirLight.position.set(vs.worldPos.x + sun.x * 100, Math.max(22, sun.y * 100), vs.worldPos.z + sun.z * 100);
      dirLight.target.position.copy(vs.worldPos); dirLight.target.updateMatrixWorld();
      const nightFactor = THREE.MathUtils.clamp(1 - daylight * 1.6, 0, 1);
      // Night: keep some ambient so lamp point lights can illuminate visible surfaces
      ambLight.intensity  = 0.22 + daylight * 0.32 * overcast + nightFactor * 0.06;
      hemiLight.intensity = 0.38 + daylight * 0.48 * overcast + nightFactor * 0.1;
      const twilightBias = THREE.MathUtils.clamp(1 - Math.abs(elev) * 5, 0, 1);
      hemiLight.color.set(new THREE.Color(0x9ec4ff).lerp(new THREE.Color(0xffb07a), twilightBias * daylight));
      hemiLight.groundColor.set(new THREE.Color(0x101820).lerp(new THREE.Color(0x5a4830), daylight));

      groundMat.color = new THREE.Color().setScalar(THREE.MathUtils.lerp(1, 0.42, nightFactor));
      cityNightLight.intensity = nightFactor * 0.18;
      cityNightLight.color.set(new THREE.Color(0x1a2a40).lerp(new THREE.Color(0x3050a0), nightFactor * 0.5));
      cityNightLight.groundColor.set(new THREE.Color(0x080808));

      const bloomNight = map.bloomStrength;
      postFx.setBloom(bloomNight, nightFactor);

      // Road wetness: shiny road in rain — brighter under street lamps at night
      const isWet = wx === "rain" || wx === "thunder";
      const nightWetRough = isWet ? 0.18 : nightFactor > 0.4 ? 0.42 : 0.78;
      const nightWetMetal = isWet ? 0.52 : nightFactor > 0.4 ? 0.28 : 0.08;
      (roadMat as THREE.MeshStandardMaterial).roughness  += (nightWetRough - (roadMat as THREE.MeshStandardMaterial).roughness)  * dt * 1.8;
      (roadMat as THREE.MeshStandardMaterial).metalness  += (nightWetMetal - (roadMat as THREE.MeshStandardMaterial).metalness)  * dt * 1.8;
      (clMat as THREE.MeshStandardMaterial).emissiveIntensity = 0.1 + nightFactor * 0.35;
      (laneMat as THREE.MeshStandardMaterial).emissiveIntensity = 0.06 + nightFactor * 0.22;

      const fogExp    = scene.fog as THREE.FogExp2;
      const fogBase   = wx === "rain" || wx === "thunder" ? 0.016 : wx === "cloudy" ? 0.009 : map.fogDensity;
      fogExp.density += (fogBase + (1 - daylight) * 0.004 - fogExp.density) * 0.06;
      fogExp.color.lerp(fogC, 0.06);
      scene.background = fogExp.color;

      // Headlights
      const hlOn = daylight < 0.3 || wx === "thunder" || wx === "rain";
      const fwdX = Math.sin(vs.heading), fwdZ = Math.cos(vs.heading);
      const sideX= Math.cos(vs.heading), sideZ= -Math.sin(vs.heading);
      headL.position.set(vs.worldPos.x + fwdX * 2.4 + sideX * 0.76, vs.worldPos.y + 0.92, vs.worldPos.z + fwdZ * 2.4 + sideZ * 0.76);
      headR.position.set(vs.worldPos.x + fwdX * 2.4 - sideX * 0.76, vs.worldPos.y + 0.92, vs.worldPos.z + fwdZ * 2.4 - sideZ * 0.76);
      headTarget.position.set(vs.worldPos.x + fwdX * 32, vs.worldPos.y + 0.4, vs.worldPos.z + fwdZ * 32);
      headL.intensity = headR.intensity = hlOn ? 72 : 0;
      hlL.material.emissiveIntensity = hlOn ? 2.8 : 0.32;
      hlR.material.emissiveIntensity = hlOn ? 2.8 : 0.32;

      const braking = spaceOn || brakeOn;
      tlL.material.emissiveIntensity = braking ? 3.5 : 0.7;
      tlR.material.emissiveIntensity = braking ? 3.5 : 0.7;

      // Thunder flash
      flashAmt = Math.max(0, flashAmt - dt * 6);
      if (wx === "thunder") {
        nextFlash -= dt;
        if (nextFlash <= 0) {
          flashAmt  = 1;
          nextFlash = 4 + Math.random() * 9;
          const el = flashRef.current;
          if (el) { el.style.opacity = "0.38"; setTimeout(() => { if (el) el.style.opacity = "0"; }, 85); }
        }
      }

      // World updates
      roadRenderer.update(vs.worldPos.x, vs.worldPos.z, nightFactor);
      intersections.update(vs.worldPos.x, vs.worldPos.z, gameTimeSec);
      pedestrians.update(vs.worldPos.x, vs.worldPos.z, dt, gameTimeSec);
      updateGroundTiles(vs.worldPos.x, vs.worldPos.z);
      peaks.update(vs.worldPos.x, vs.worldPos.z);
      vegetation?.update(vs.worldPos.x, vs.worldPos.z, vs.s, isNearRoad);
      updateClouds(vs, wx, dt);
      updateRain(vs, wx, dt);
      updateSnow(vs, bw, dt);

      city?.update(vs.worldPos.x, vs.worldPos.z, nightFactor);
      traffic.update(vs.worldPos.x, vs.worldPos.z, gameTimeSec, dt);

      const poleHits = resolveObstacleCollisions(vs.worldPos.x, vs.worldPos.z, [
        ...intersections.getObstacles(),
        ...(city?.getObstacles() ?? []),
      ]);
      if (poleHits.hit) {
        vs.worldPos.x = poleHits.x;
        vs.worldPos.z = poleHits.z;
        carGroup.position.x = poleHits.x;
        carGroup.position.z = poleHits.z;
        vs.speed *= Math.max(0.35, 1 - dt * 4);
      }

      const rpmNow = Math.min(100, (Math.abs(vs.speed) / MAX_SPEED) * 100);
      gameAudio.update({
        speedKmh: Math.abs(vs.speed) * 3.6,
        rpm: rpmNow,
        weather: wx,
        mapId: mapIdRef.current,
        nightFactor,
        headlightsOn: hlOn,
        playerX: vs.worldPos.x,
        playerZ: vs.worldPos.z,
        traffic: traffic.getPositions(),
        dt,
        thunderFlash: flashAmt,
      });

      if (map.displayBiome !== lastBiomeRef.current) {
        lastBiomeRef.current = map.displayBiome;
        biomeTimerRef.current = 3;
        setCurrentBiome(map.displayBiome);
        setShowBiome(true);
      }
      if (biomeTimerRef.current > 0) {
        biomeTimerRef.current -= dt;
        if (biomeTimerRef.current <= 0) setShowBiome(false);
      }

      // HUD
      const rpmVal = Math.min(100, (Math.abs(vs.speed) / MAX_SPEED) * 100);
      setSpeed(Math.round(Math.abs(vs.speed) * 3.6));
      setRpm(rpmVal);
      setGear(vs.speed < -0.5 ? "R" : vs.speed < 0.5 ? "N" : String(vs.gear));

      // Minimap — draw road grid around player
      minimapRef.current?.draw(vs.worldPos.x, vs.worldPos.z, vs.heading);

      postFx.render();
    };

    animId = requestAnimationFrame(t => { lastTime = t; animate(t); });

    return () => {
      cancelled = true;
      audioRef.current = null;
      cancelAnimationFrame(animId);
      window.removeEventListener("resize",  onResize);
      mount.removeEventListener("pointerdown", unlockOnPointer);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup",   onKeyUp);
      vegetation?.dispose();
      city?.dispose();
      peaks.dispose();
      roadRenderer.dispose();
      intersections.dispose();
      pedestrians.dispose();
      postFx.dispose();
      gameAudio.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, [mapId]);

  const hrs  = Math.floor(timeOfDay * 24);
  const mins = Math.floor((timeOfDay * 24 - hrs) * 60);
  const timeDisplay = `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
  const isNight = timeOfDay < 0.22 || timeOfDay > 0.78;

  return (
    <div style={{
      position: "relative", width: "100vw", height: "100vh",
      overflow: "hidden", background: "#000",
      fontFamily: "'SF Mono', 'Cascadia Code', 'Fira Code', monospace",
    }}>
      <div ref={mountRef} style={{ position: "absolute", inset: 0, zIndex: 0 }} />

      {worldLoading && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 60,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(0,0,0,0.55)", color: "#fff", fontSize: 15,
          letterSpacing: "0.08em", pointerEvents: "none",
        }}>
          Loading world…
        </div>
      )}

      {loadStatus && (
        <div style={{
          position: "absolute", bottom: 72, left: "50%", transform: "translateX(-50%)",
          zIndex: 40, padding: "8px 14px", borderRadius: 10,
          background: "rgba(6,8,14,0.75)", color: "rgba(255,255,255,0.85)",
          fontSize: 12, letterSpacing: "0.05em", pointerEvents: "none",
        }}>
          {loadStatus}
        </div>
      )}

      {/* Thunder flash */}
      <div ref={flashRef} style={{
        position: "fixed", inset: 0, background: "#fff",
        opacity: 0, pointerEvents: "none", zIndex: 50,
        transition: "opacity .05s",
      }} />

      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none", zIndex: 2,
        background: "radial-gradient(ellipse at center, transparent 62%, rgba(0,0,0,.28) 100%)",
      }} />

      {!audioReady && !worldLoading && (
        <button
          type="button"
          onClick={() => { void enableAudio(); }}
          style={{
            position: "absolute", bottom: 100, left: "50%", transform: "translateX(-50%)",
            zIndex: 45, pointerEvents: "auto",
            padding: "12px 28px", borderRadius: 999,
            border: "1px solid rgba(255,255,255,.25)",
            background: "rgba(8,12,20,.88)", color: "#fff",
            fontSize: 13, letterSpacing: "0.08em", cursor: "pointer",
            fontFamily: "inherit", backdropFilter: "blur(16px)",
            boxShadow: "0 8px 32px rgba(0,0,0,.5)",
          }}
        >
          Tap to enable sound & graphics
        </button>
      )}

      <HUD
        speed={speed} rpm={rpm} gear={gear} weather={weather}
        timeDisplay={timeDisplay} isNight={isNight} timeOfDay={timeOfDay} autoTime={autoTime}
        showBiome={showBiome} currentBiome={currentBiome}
        onWeatherChange={handleWeather}
        onTimeChange={handleTimeChange}
        onAutoTimeChange={handleAutoTimeChange}
        audioMuted={audioMuted}
        onToggleMute={audioReady ? toggleAudioMute : undefined}
      />

      <Minimap ref={minimapRef} />

      <TouchControls
        onGas={v   => { touchGasRef.current   = v; }}
        onBrake={v  => { touchBrakeRef.current  = v; }}
        onLeft={v   => { touchLeftRef.current   = v; }}
        onRight={v  => { touchRightRef.current  = v; }}
      />

      <GraphicsSettings
        quality={quality}
        onChange={setQuality}
        cameraMode={cameraMode}
        onCameraChange={setCameraMode}
      />

      <MapSelector
        selected={mapId}
        onChange={handleMapChange}
        disabled={worldLoading}
      />

      <CarColorPicker selected={carColor} onSelect={setCarColor} />

      <PauseMenu
        paused={paused}
        onResume={() => setPaused(false)}
        onReset={() => { resetRef.current = true; setPaused(false); }}
      />
    </div>
  );
}
