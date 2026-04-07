"use client";

import { useRef, useEffect, useState, Component, type ReactNode } from "react";
import { useGameStore } from "@/lib/game-store";
import { skinToGlb, mapToEnvironmentGlb } from "@/lib/constants";

/* ------------------------------------------------------------------ */
/*  Babylon.js imports (tree-shakeable ES6)                           */
/* ------------------------------------------------------------------ */
import { Engine } from "@babylonjs/core/Engines/engine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { Vector3, Color3, Color4 } from "@babylonjs/core/Maths/math.js";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera.js";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight.js";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight.js";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";

// Side-effect imports: register scene components for tree-shaking
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent.js";
import "@babylonjs/core/Rendering/edgesRenderer.js";
import "@babylonjs/core/Meshes/Builders/boxBuilder.js";
import "@babylonjs/core/Meshes/Builders/groundBuilder.js";
import "@babylonjs/core/Meshes/Builders/torusBuilder.js";
import "@babylonjs/core/Materials/standardMaterial.js";
import "@babylonjs/core/Loading/loadingScreen.js";
// GLB/glTF loader plugin
import "@babylonjs/loaders/glTF/2.0/index.js";

/* ------------------------------------------------------------------ */
/*  Error boundary for canvas crashes                                  */
/* ------------------------------------------------------------------ */
class CanvasErrorBoundary extends Component<
  { children: ReactNode },
  { error: string | null }
> {
  state = { error: null as string | null };

  static getDerivedStateFromError(err: Error) {
    return { error: err.message };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="w-full h-full flex items-center justify-center bg-[#0a0a0f]">
          <div className="text-center max-w-md px-6">
            <p className="text-red-400 text-lg font-bold mb-2">
              3D Renderer Error
            </p>
            <p className="text-white/50 text-sm mb-4">{this.state.error}</p>
            <button
              onClick={() => this.setState({ error: null })}
              className="px-4 py-2 rounded bg-white/10 text-white/70 text-sm hover:bg-white/20"
            >
              Retry
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ------------------------------------------------------------------ */
/*  WebGL availability check                                           */
/* ------------------------------------------------------------------ */
function useWebGLAvailable() {
  const [available, setAvailable] = useState<boolean | null>(null);
  useEffect(() => {
    try {
      const canvas = document.createElement("canvas");
      const gl =
        canvas.getContext("webgl2") || canvas.getContext("webgl");
      setAvailable(!!gl);
      if (gl) {
        const ext = gl.getExtension("WEBGL_lose_context");
        ext?.loseContext();
      }
    } catch {
      setAvailable(false);
    }
  }, []);
  return available;
}

/* ------------------------------------------------------------------ */
/*  Penguin tracking data                                              */
/* ------------------------------------------------------------------ */
interface PenguinTracker {
  root: TransformNode;
  meshes: AbstractMesh[];
  arrow: Mesh;
  interpFrom: Vector3;
  interpTo: Vector3;
  interpT: number;
  lastX: number;
  lastZ: number;
  lastY: number;
  currentRotY: number;
}

/* ------------------------------------------------------------------ */
/*  Build a flat 2D arrow mesh (lies in XZ plane, points +Z)          */
/* ------------------------------------------------------------------ */
function createArrowMesh(scene: Scene, name: string, color: Color3): Mesh {
  const shaftLen = 2.0;
  const shaftW = 0.14;
  const headLen = 0.5;
  const headW = 0.4;

  // Arrow in XZ plane, pointing +Z
  const positions = [
    // Shaft (quad: 2 triangles)
    -shaftW, 0, 0,
     shaftW, 0, 0,
     shaftW, 0, shaftLen,
    -shaftW, 0, shaftLen,
    // Head (triangle)
    -headW, 0, shaftLen,
     headW, 0, shaftLen,
     0,     0, shaftLen + headLen,
  ];
  const indices = [
    0, 1, 2, 0, 2, 3,  // shaft
    4, 5, 6,            // head
  ];
  const normals = [
    0, 1, 0,  0, 1, 0,  0, 1, 0,  0, 1, 0,
    0, 1, 0,  0, 1, 0,  0, 1, 0,
  ];

  const mesh = new Mesh(name, scene);
  const vd = new VertexData();
  vd.positions = positions;
  vd.indices = indices;
  vd.normals = normals;
  vd.applyToMesh(mesh);

  const mat = new StandardMaterial(name + "_mat", scene);
  mat.diffuseColor = color;
  mat.emissiveColor = color.scale(0.6);
  mat.alpha = 0.85;
  mat.backFaceCulling = false;
  mesh.material = mat;
  mesh.position.y = 2.8;
  mesh.isPickable = false;

  return mesh;
}

/* ------------------------------------------------------------------ */
/*  Scene builder — all Babylon.js logic lives here                   */
/* ------------------------------------------------------------------ */
class GameScene {
  engine: Engine;
  scene: Scene;
  camera: ArcRotateCamera;
  shadowGen: ShadowGenerator | null = null;
  penguins: Map<string, PenguinTracker> = new Map();
  mapTiles: AbstractMesh[] = [];
  environmentRoot: TransformNode | null = null;
  waterPlane: Mesh | null = null;
  platformRoot: TransformNode | null = null;

  // Loaded GLB caches
  private skinCache: Map<string, AbstractMesh[]> = new Map();
  private mapBlockTemplate: AbstractMesh[] | null = null;

  private playerId: string;
  private disposed = false;
  private lobbyTime = 0;

  constructor(canvas: HTMLCanvasElement, playerId: string) {
    this.playerId = playerId;

    // Engine
    this.engine = new Engine(canvas, true, {
      preserveDrawingBuffer: true,
      stencil: true,
    });

    // Scene
    this.scene = new Scene(this.engine);
    this.scene.clearColor = new Color4(0.529, 0.808, 0.922, 1); // #87ceeb
    this.scene.fogMode = Scene.FOGMODE_LINEAR;
    this.scene.fogColor = new Color3(0.529, 0.808, 0.922);
    this.scene.fogStart = 100;
    this.scene.fogEnd = 350;
    this.scene.ambientColor = new Color3(0.3, 0.3, 0.35);

    // Camera
    this.camera = new ArcRotateCamera(
      "cam",
      -Math.PI / 2,
      Math.PI / 3,
      20,
      Vector3.Zero(),
      this.scene
    );
    this.camera.lowerRadiusLimit = 5;
    this.camera.upperRadiusLimit = 40;
    this.camera.lowerBetaLimit = 0.1;
    this.camera.upperBetaLimit = Math.PI / 2.1;
    this.camera.attachControl(canvas, true);
    // Disable default panning/keyboard so game controls work
    this.camera.panningSensibility = 0;
    this.camera.keysUp = [];
    this.camera.keysDown = [];
    this.camera.keysLeft = [];
    this.camera.keysRight = [];

    // Lighting
    const hemi = new HemisphericLight("hemi", new Vector3(0, 1, 0), this.scene);
    hemi.intensity = 1.0;
    hemi.diffuse = new Color3(0.7, 0.75, 0.85);
    hemi.groundColor = new Color3(0.53, 0.67, 0.8);

    const dir = new DirectionalLight("dir", new Vector3(-1, -2, -1).normalize(), this.scene);
    dir.position = new Vector3(30, 50, 25);
    dir.intensity = 1.8;
    dir.diffuse = new Color3(1, 0.98, 0.95);

    // Shadows
    this.shadowGen = new ShadowGenerator(2048, dir);
    this.shadowGen.useBlurExponentialShadowMap = true;
    this.shadowGen.blurKernel = 16;

    // Water plane
    this.waterPlane = MeshBuilder.CreateGround("water", {
      width: 400,
      height: 400,
    }, this.scene);
    this.waterPlane.position.y = -3;
    const waterMat = new StandardMaterial("waterMat", this.scene);
    waterMat.diffuseColor = new Color3(0.13, 0.59, 0.95);
    waterMat.alpha = 0.7;
    waterMat.specularColor = new Color3(0.3, 0.4, 0.5);
    this.waterPlane.material = waterMat;
    this.waterPlane.receiveShadows = true;

    // Inspector in dev mode
    if (process.env.NODE_ENV === "development") {
      this.scene.onKeyboardObservable.add((kbInfo) => {
        if (kbInfo.type === 2 && kbInfo.event.key === "F9") {
          if (this.scene.debugLayer.isVisible()) {
            this.scene.debugLayer.hide();
          } else {
            import("@babylonjs/core/Debug/debugLayer.js").then(() => {
              import("@babylonjs/inspector").then(() => {
                this.scene.debugLayer.show({ embedMode: true });
              });
            });
          }
        }
      });
    }

    // Render loop
    this.engine.runRenderLoop(() => {
      if (this.disposed) return;
      this.updateFrame();
      this.scene.render();
    });

    // Resize
    const onResize = () => this.engine.resize();
    window.addEventListener("resize", onResize);
    this.scene.onDisposeObservable.add(() => {
      window.removeEventListener("resize", onResize);
    });
  }

  /* ── Load assets ── */
  async init() {
    const gs = useGameStore.getState().gameState;
    if (!gs) return;

    // Load map block template
    await this.loadMapBlockTemplate();

    // Build tiled platform
    this.buildPlatform(gs.map.length, gs.map.width);

    // Load environment
    await this.loadEnvironment(gs.map.type);

    // Load all penguin skins & create instances
    await this.loadPenguins(gs);
  }

  private async loadMapBlockTemplate() {
    try {
      const result = await SceneLoader.ImportMeshAsync("", "/assets/", "MapBlock.glb", this.scene);
      // Hide originals, store as template
      this.mapBlockTemplate = result.meshes;
      for (const m of result.meshes) {
        m.setEnabled(false);
      }
    } catch (e) {
      console.warn("Failed to load MapBlock.glb, using fallback platform", e);
    }
  }

  private buildPlatform(mapLength: number, mapWidth: number) {
    this.platformRoot = new TransformNode("platform", this.scene);

    if (this.mapBlockTemplate && this.mapBlockTemplate.length > 0) {
      // MapBlock.glb is 2x2 units (x: -1..1, z: -1..1)
      const blockSize = 2;
      const tilesX = Math.ceil(mapLength / blockSize);
      const tilesZ = Math.ceil(mapWidth / blockSize);
      const offsetX = -(tilesX * blockSize) / 2 + blockSize / 2;
      const offsetZ = -(tilesZ * blockSize) / 2 + blockSize / 2;

      for (let ix = 0; ix < tilesX; ix++) {
        for (let iz = 0; iz < tilesZ; iz++) {
          for (const orig of this.mapBlockTemplate) {
            if (!orig.name || orig.name === "__root__") continue;
            const clone = (orig as Mesh).clone(`tile_${ix}_${iz}_${orig.name}`, this.platformRoot);
            if (!clone) continue;
            clone.setEnabled(true);
            clone.position.x += offsetX + ix * blockSize;
            clone.position.z += offsetZ + iz * blockSize;
            clone.receiveShadows = true;
            this.mapTiles.push(clone);
          }
        }
      }
    } else {
      // Fallback: simple box
      const platform = MeshBuilder.CreateBox("platform_fallback", {
        width: mapLength,
        height: 0.5,
        depth: mapWidth,
      }, this.scene);
      platform.position.y = -0.25;
      const mat = new StandardMaterial("platformMat", this.scene);
      mat.diffuseColor = new Color3(0.75, 0.82, 0.88);
      mat.specularColor = new Color3(0.2, 0.25, 0.3);
      platform.material = mat;
      platform.receiveShadows = true;
      platform.parent = this.platformRoot;
    }
  }

  private async loadEnvironment(mapType: string) {
    const glbPath = mapToEnvironmentGlb(mapType);
    try {
      const result = await SceneLoader.ImportMeshAsync("", "", glbPath, this.scene);
      this.environmentRoot = new TransformNode("env", this.scene);
      for (const m of result.meshes) {
        m.parent = this.environmentRoot;
      }
      this.environmentRoot.position = new Vector3(0, -8, 0);
      this.environmentRoot.scaling = new Vector3(3, 3, 3);
    } catch (e) {
      console.warn("Failed to load environment", glbPath, e);
    }
  }

  private async loadSkin(skin: string): Promise<AbstractMesh[]> {
    if (this.skinCache.has(skin)) return this.skinCache.get(skin)!;

    const glbPath = skinToGlb(skin);
    try {
      const result = await SceneLoader.ImportMeshAsync("", "", glbPath, this.scene);
      // Disable originals (used as templates)
      for (const m of result.meshes) {
        m.setEnabled(false);
      }
      this.skinCache.set(skin, result.meshes);
      return result.meshes;
    } catch (e) {
      console.warn("Failed to load penguin skin", glbPath, e);
      return [];
    }
  }

  private async loadPenguins(gs: import("@/lib/types").GameState) {
    const mapCenterX = gs.map.length / 2;
    const mapCenterZ = gs.map.width / 2;

    for (const [id, penguin] of Object.entries(gs.players)) {
      const templateMeshes = await this.loadSkin(penguin.skin);
      if (templateMeshes.length === 0) continue;

      const isCurrentPlayer = id === this.playerId;
      const root = new TransformNode(`penguin_${id}`, this.scene);

      const cx = penguin.position.x - mapCenterX;
      const cz = penguin.position.z - mapCenterZ;
      const y = penguin.eliminated > 0 ? -3 : 0.5;
      root.position = new Vector3(cx, y, cz);

      // Clone meshes
      const clonedMeshes: AbstractMesh[] = [];
      for (const orig of templateMeshes) {
        if (!orig.name || orig.name === "__root__") continue;
        const clone = (orig as Mesh).clone(`${id}_${orig.name}`, root);
        if (!clone) continue;
        clone.setEnabled(true);
        clone.scaling = new Vector3(1.2, 1.2, 1.2);
        clone.receiveShadows = true;
        if (this.shadowGen) {
          this.shadowGen.addShadowCaster(clone);
        }
        clonedMeshes.push(clone);
      }

      // Arrow
      const arrowColor = isCurrentPlayer
        ? new Color3(1, 0.8, 0)
        : new Color3(1, 0.27, 0.27);
      const arrow = createArrowMesh(this.scene, `arrow_${id}`, arrowColor);
      arrow.parent = root;
      arrow.setEnabled(false);

      // Glow ring for current player
      if (isCurrentPlayer) {
        const ring = MeshBuilder.CreateTorus(`ring_${id}`, {
          diameter: 2.0,
          thickness: 0.15,
          tessellation: 32,
        }, this.scene);
        ring.parent = root;
        ring.position.y = 0.05;
        const ringMat = new StandardMaterial(`ringMat_${id}`, this.scene);
        ringMat.diffuseColor = new Color3(0.13, 0.83, 0.93);
        ringMat.emissiveColor = new Color3(0.1, 0.5, 0.6);
        ringMat.alpha = 0.4;
        ring.material = ringMat;
        ring.isPickable = false;
      }

      const rad = (penguin.direction * Math.PI) / 180;
      const initRotY = -rad + Math.PI / 2;

      this.penguins.set(id, {
        root,
        meshes: clonedMeshes,
        arrow,
        interpFrom: new Vector3(cx, y, cz),
        interpTo: new Vector3(cx, y, cz),
        interpT: 1,
        lastX: cx,
        lastZ: cz,
        lastY: y,
        currentRotY: initRotY,
      });
    }
  }

  /* ── Per-frame update ── */
  private updateFrame() {
    const store = useGameStore.getState();
    const gs = store.gameState;
    const phase = store.phase;
    if (!gs) return;

    const dt = this.engine.getDeltaTime() / 1000; // seconds
    const mapCenterX = gs.map.length / 2;
    const mapCenterZ = gs.map.width / 2;

    // Camera: lobby orbit
    if (phase === "lobby") {
      this.lobbyTime += dt;
      this.camera.target = Vector3.Zero();
      this.camera.alpha = -Math.PI / 2 + this.lobbyTime * 0.15;
      this.camera.beta = Math.PI / 3;
      this.camera.radius = 28;
      // Detach controls during lobby orbit
      return;
    }

    // Update each penguin
    for (const [id, tracker] of this.penguins) {
      const penguin = gs.players[id];
      if (!penguin) continue;

      const cx = penguin.position.x - mapCenterX;
      const cz = penguin.position.z - mapCenterZ;
      const y = penguin.eliminated > 0 ? -3 : 0.5;

      // Detect position change → start interpolation
      if (cx !== tracker.lastX || cz !== tracker.lastZ || y !== tracker.lastY) {
        tracker.interpFrom.copyFrom(tracker.root.position);
        tracker.interpTo.set(cx, y, cz);
        tracker.interpT = 0;
        tracker.lastX = cx;
        tracker.lastZ = cz;
        tracker.lastY = y;
      }

      // Smooth position interpolation
      const INTERP_DURATION = 0.04;
      if (tracker.interpT < 1) {
        tracker.interpT = Math.min(1, tracker.interpT + dt / INTERP_DURATION);
        const t = tracker.interpT * tracker.interpT * (3 - 2 * tracker.interpT);
        Vector3.LerpToRef(tracker.interpFrom, tracker.interpTo, t, tracker.root.position);
      } else {
        // Gently hold at target
        const blend = 1 - Math.exp(-10 * dt);
        tracker.root.position.x += (tracker.interpTo.x - tracker.root.position.x) * blend;
        tracker.root.position.y += (tracker.interpTo.y - tracker.root.position.y) * blend;
        tracker.root.position.z += (tracker.interpTo.z - tracker.root.position.z) * blend;
      }

      // Rotation: penguin model faces +Z. rotation.y = θ maps +Z to (sin(θ), cos(θ))
      // Physics dir 0° = +X → targetRotY = -rad + π/2
      const isCurrentPlayer = id === this.playerId;
      const dir = isCurrentPlayer && phase === "countdown"
        ? store.aimDirection
        : penguin.direction;
      const rad = (dir * Math.PI) / 180;
      const targetRotY = -rad + Math.PI / 2;

      // Smooth rotation
      let diff = targetRotY - tracker.currentRotY;
      // Normalize diff to [-π, π]
      while (diff > Math.PI) diff -= 2 * Math.PI;
      while (diff < -Math.PI) diff += 2 * Math.PI;
      tracker.currentRotY += diff * (1 - Math.exp(-10 * dt));
      tracker.root.rotation.y = tracker.currentRotY;

      // Arrow visibility
      const showArrow = (phase === "countdown" || phase === "animating") && penguin.eliminated === 0;
      tracker.arrow.setEnabled(showArrow);

      if (showArrow) {
        // Scale arrow with power
        const power = isCurrentPlayer ? store.aimPower : 6;
        const scale = 0.6 + (power / 10) * 1.5;
        tracker.arrow.scaling.z = scale;
        // Bob up and down
        tracker.arrow.position.y = 2.8 + Math.sin(performance.now() / 333) * 0.1;
      }
    }

    // Camera follow during gameplay
    const player = gs.players[this.playerId];
    if (player && player.eliminated === 0) {
      const px = player.position.x - mapCenterX;
      const pz = player.position.z - mapCenterZ;
      const target = new Vector3(px, 1, pz);

      const smoothSpeed = phase === "countdown" ? 5 : 3;
      const blend = 1 - Math.exp(-smoothSpeed * dt);
      this.camera.target.x += (target.x - this.camera.target.x) * blend;
      this.camera.target.y += (target.y - this.camera.target.y) * blend;
      this.camera.target.z += (target.z - this.camera.target.z) * blend;

      // Alpha follows aim direction during countdown
      if (phase === "countdown") {
        const aimRad = (store.aimDirection * Math.PI) / 180;
        // Camera behind player: alpha = aimRad + π (look from behind)
        let targetAlpha = aimRad + Math.PI;
        let alphaDiff = targetAlpha - this.camera.alpha;
        while (alphaDiff > Math.PI) alphaDiff -= 2 * Math.PI;
        while (alphaDiff < -Math.PI) alphaDiff += 2 * Math.PI;
        this.camera.alpha += alphaDiff * (1 - Math.exp(-5 * dt));
      }
    } else {
      // Spectator: look at center
      const blend = 1 - Math.exp(-2 * dt);
      this.camera.target.x += (0 - this.camera.target.x) * blend;
      this.camera.target.y += (1 - this.camera.target.y) * blend;
      this.camera.target.z += (0 - this.camera.target.z) * blend;
    }

    // Handle new players joining
    this.syncPlayers(gs);
  }

  /* ── Sync players: add new ones that joined mid-game ── */
  private syncPlayers(gs: import("@/lib/types").GameState) {
    for (const id of Object.keys(gs.players)) {
      if (!this.penguins.has(id)) {
        // New player appeared — load their penguin
        this.loadPenguinSingle(id, gs).catch(console.warn);
      }
    }
  }

  private async loadPenguinSingle(id: string, gs: import("@/lib/types").GameState) {
    const penguin = gs.players[id];
    if (!penguin || this.penguins.has(id)) return;

    const mapCenterX = gs.map.length / 2;
    const mapCenterZ = gs.map.width / 2;

    const templateMeshes = await this.loadSkin(penguin.skin);
    if (templateMeshes.length === 0) return;

    const isCurrentPlayer = id === this.playerId;
    const root = new TransformNode(`penguin_${id}`, this.scene);
    const cx = penguin.position.x - mapCenterX;
    const cz = penguin.position.z - mapCenterZ;
    const y = penguin.eliminated > 0 ? -3 : 0.5;
    root.position = new Vector3(cx, y, cz);

    const clonedMeshes: AbstractMesh[] = [];
    for (const orig of templateMeshes) {
      if (!orig.name || orig.name === "__root__") continue;
      const clone = (orig as Mesh).clone(`${id}_${orig.name}`, root);
      if (!clone) continue;
      clone.setEnabled(true);
      clone.scaling = new Vector3(1.2, 1.2, 1.2);
      clone.receiveShadows = true;
      if (this.shadowGen) this.shadowGen.addShadowCaster(clone);
      clonedMeshes.push(clone);
    }

    const arrowColor = isCurrentPlayer
      ? new Color3(1, 0.8, 0)
      : new Color3(1, 0.27, 0.27);
    const arrow = createArrowMesh(this.scene, `arrow_${id}`, arrowColor);
    arrow.parent = root;
    arrow.setEnabled(false);

    const rad = (penguin.direction * Math.PI) / 180;
    this.penguins.set(id, {
      root,
      meshes: clonedMeshes,
      arrow,
      interpFrom: new Vector3(cx, y, cz),
      interpTo: new Vector3(cx, y, cz),
      interpT: 1,
      lastX: cx,
      lastZ: cz,
      lastY: y,
      currentRotY: -rad + Math.PI / 2,
    });
  }

  /* ── Cleanup ── */
  dispose() {
    this.disposed = true;
    this.engine.stopRenderLoop();
    this.scene.dispose();
    this.engine.dispose();
  }
}

/* ------------------------------------------------------------------ */
/*  React component                                                    */
/* ------------------------------------------------------------------ */
interface GameArenaProps {
  playerId: string;
}

export default function GameArena({ playerId }: GameArenaProps) {
  const gameState = useGameStore((s) => s.gameState);
  const webglAvailable = useWebGLAvailable();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<GameScene | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !gameState || sceneRef.current) return;

    const gs = new GameScene(canvas, playerId);
    sceneRef.current = gs;
    gs.init().catch(console.error);

    return () => {
      gs.dispose();
      sceneRef.current = null;
    };
  }, [playerId, gameState]);

  if (!gameState) return null;

  if (webglAvailable === false) {
    return (
      <div
        style={{ position: "absolute", top: 0, left: 0, width: "100vw", height: "100vh" }}
        className="flex items-center justify-center bg-[#0a0a0f]"
      >
        <div className="text-center max-w-md px-6">
          <p className="text-red-400 text-xl font-bold mb-2">
            WebGL Not Available
          </p>
          <p className="text-white/50 text-sm">
            Your browser or device does not support WebGL, which is required for
            the 3D game arena. Try a different browser or enable hardware
            acceleration in your browser settings.
          </p>
        </div>
      </div>
    );
  }

  if (webglAvailable === null) {
    return (
      <div
        style={{ position: "absolute", top: 0, left: 0, width: "100vw", height: "100vh" }}
        className="flex items-center justify-center bg-[#0a0a0f]"
      >
        <div className="text-white/40 text-sm">Initializing 3D arena...</div>
      </div>
    );
  }

  return (
    <div style={{ position: "absolute", top: 0, left: 0, width: "100vw", height: "100vh" }}>
      <CanvasErrorBoundary>
        <canvas
          ref={canvasRef}
          style={{ width: "100%", height: "100%", display: "block", touchAction: "none" }}
        />
      </CanvasErrorBoundary>
    </div>
  );
}
