"use client";

import { useRef, useEffect, useState, Component, type ReactNode } from "react";
import { useGameStore } from "@/lib/game-store";
import { skinToGlb, mapToEnvironmentGlb } from "@/lib/constants";
import { registerMove, sendPosition } from "@/lib/ws";

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
      const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
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
  isEliminated: boolean;
}

const LOBBY_INTERP_DURATION = 0.04;
const SERVER_INTERP_DURATION = 0.05;
const FOLLOW_CAMERA_BETA = 1.08;
const FOLLOW_CAMERA_RADIUS = 13;
const COUNTDOWN_CAMERA_RADIUS = 11.5;
const COUNTDOWN_MOUSE_TURN_DEG_PER_PX = 0.35;

function normalizeDegrees(value: number) {
  return ((value % 360) + 360) % 360;
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
    -shaftW,
    0,
    0,
    shaftW,
    0,
    0,
    shaftW,
    0,
    shaftLen,
    -shaftW,
    0,
    shaftLen,
    // Head (triangle)
    -headW,
    0,
    shaftLen,
    headW,
    0,
    shaftLen,
    0,
    0,
    shaftLen + headLen,
  ];
  const indices = [
    0,
    1,
    2,
    0,
    2,
    3, // shaft
    4,
    5,
    6, // head
  ];
  const normals = [
    0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0,
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
  private pendingPenguinLoads: Set<string> = new Set();
  private mapBlockTemplate: AbstractMesh[] | null = null;

  private playerId: string;
  private disposed = false;
  private lobbyTime = 0;
  private lastPhase: string = "";
  private lastPosSendTime: number = 0;
  private cameraControlsAttached = true;
  private lastAimBroadcastTime: number = 0;
  private countdownPointerActive = false;
  private lastCountdownPointerX: number | null = null;
  private countdownPointerDownHandler: ((e: PointerEvent) => void) | null =
    null;
  private countdownPointerMoveHandler: ((e: PointerEvent) => void) | null =
    null;
  private countdownPointerUpHandler: ((e: PointerEvent) => void) | null = null;

  // Lobby WASD state
  private lobbyKeys = { w: false, a: false, s: false, d: false };
  private lobbyPos: { x: number; z: number } | null = null;
  private lobbyKeyHandler: ((e: KeyboardEvent) => void) | null = null;
  private lobbyKeyUpHandler: ((e: KeyboardEvent) => void) | null = null;

  // Map shrinking tracking
  private renderedMapLength: number = 0;
  private renderedMapWidth: number = 0;

  // Stage (spectator area from environment GLB)
  private stageCenter: Vector3 | null = null;
  private stageHalfX: number = 5;
  private stageHalfZ: number = 5;
  private stageY: number = 0.5;

  constructor(canvas: HTMLCanvasElement, playerId: string) {
    this.playerId = playerId;

    // Engine
    this.engine = new Engine(canvas, true, {
      preserveDrawingBuffer: true,
      stencil: true,
    });

    // Scene
    this.scene = new Scene(this.engine);
    this.scene.clearColor = new Color4(0.76, 0.87, 0.94, 1); // soft pastel sky
    this.scene.fogMode = Scene.FOGMODE_LINEAR;
    this.scene.fogColor = new Color3(0.76, 0.87, 0.94);
    this.scene.fogStart = 80;
    this.scene.fogEnd = 250;
    this.scene.ambientColor = new Color3(0.4, 0.4, 0.4);

    // Camera
    this.camera = new ArcRotateCamera(
      "cam",
      -Math.PI / 2,
      Math.PI / 3,
      25,
      Vector3.Zero(),
      this.scene,
    );
    this.camera.lowerRadiusLimit = 5;
    this.camera.upperRadiusLimit = 60;
    this.camera.lowerBetaLimit = 0.1;
    this.camera.upperBetaLimit = Math.PI / 2.1;
    this.camera.minZ = 0.5; // tighter near plane reduces z-fighting
    this.camera.maxZ = 300;
    this.camera.attachControl(canvas, true);
    // Disable default panning/keyboard so game controls work
    this.camera.panningSensibility = 0;
    this.camera.keysUp = [];
    this.camera.keysDown = [];
    this.camera.keysLeft = [];
    this.camera.keysRight = [];

    this.countdownPointerDownHandler = (e: PointerEvent) => {
      if (useGameStore.getState().phase !== "countdown") return;
      this.countdownPointerActive = true;
      this.lastCountdownPointerX = e.clientX;
    };
    this.countdownPointerMoveHandler = (e: PointerEvent) => {
      if (!this.countdownPointerActive) return;
      const lastX = this.lastCountdownPointerX ?? e.clientX;
      const dx = e.clientX - lastX;
      this.lastCountdownPointerX = e.clientX;
      if (Math.abs(dx) < 0.1) return;

      const store = useGameStore.getState();
      const nextAimDirection = normalizeDegrees(
        store.aimDirection + dx*COUNTDOWN_MOUSE_TURN_DEG_PER_PX,
      );
      store.setAimDirection(nextAimDirection);

      const now = Date.now();
      if (now - this.lastAimBroadcastTime >= 33) {
        this.lastAimBroadcastTime = now;
        try {
          registerMove({
            direction: nextAimDirection,
            power: store.aimPower,
          });
        } catch {
          /* no websocket in test mode */
        }
      }
    };
    this.countdownPointerUpHandler = () => {
      this.countdownPointerActive = false;
      this.lastCountdownPointerX = null;
    };
    canvas.addEventListener("pointerdown", this.countdownPointerDownHandler);
    canvas.addEventListener("pointermove", this.countdownPointerMoveHandler);
    window.addEventListener("pointerup", this.countdownPointerUpHandler);
    window.addEventListener("pointercancel", this.countdownPointerUpHandler);

    // Lighting — neutral white to preserve GLB material colors
    const hemi = new HemisphericLight("hemi", new Vector3(0, 1, 0), this.scene);
    hemi.intensity = 0.9;
    hemi.diffuse = new Color3(0.95, 0.95, 0.97);
    hemi.groundColor = new Color3(0.7, 0.72, 0.75);

    const dir = new DirectionalLight(
      "dir",
      new Vector3(-1, -2, -1).normalize(),
      this.scene,
    );
    dir.position = new Vector3(30, 50, 25);
    dir.intensity = 1.5;
    dir.diffuse = new Color3(1, 0.99, 0.96);

    // Shadows
    this.shadowGen = new ShadowGenerator(2048, dir);
    this.shadowGen.useBlurExponentialShadowMap = true;
    this.shadowGen.blurKernel = 16;
    dir.shadowMinZ = 0;
    dir.shadowMaxZ = 100;

    // Water plane
    this.waterPlane = MeshBuilder.CreateGround(
      "water",
      {
        width: 200,
        height: 200,
      },
      this.scene,
    );
    this.waterPlane.position.y = -3;
    const waterMat = new StandardMaterial("waterMat", this.scene);
    waterMat.diffuseColor = new Color3(0.35, 0.6, 0.78);
    waterMat.alpha = 0.5;
    waterMat.specularColor = new Color3(0.2, 0.25, 0.3);
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

    // Lobby WASD key listeners
    this.lobbyKeyHandler = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k in this.lobbyKeys)
        (this.lobbyKeys as Record<string, boolean>)[k] = true;
    };
    this.lobbyKeyUpHandler = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k in this.lobbyKeys)
        (this.lobbyKeys as Record<string, boolean>)[k] = false;
    };
    window.addEventListener("keydown", this.lobbyKeyHandler);
    window.addEventListener("keyup", this.lobbyKeyUpHandler);

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
      if (this.countdownPointerDownHandler) {
        canvas.removeEventListener("pointerdown", this.countdownPointerDownHandler);
      }
      if (this.countdownPointerMoveHandler) {
        canvas.removeEventListener("pointermove", this.countdownPointerMoveHandler);
      }
      if (this.countdownPointerUpHandler) {
        window.removeEventListener("pointerup", this.countdownPointerUpHandler);
        window.removeEventListener("pointercancel", this.countdownPointerUpHandler);
      }
    });
  }

  /* ── Load assets ── */
  async init() {
    const gs = useGameStore.getState().gameState;
    if (!gs) return;

    // Mark all player IDs as pending IMMEDIATELY — syncPlayers() runs
    // every frame during the async loads below, and would create duplicates
    for (const id of Object.keys(gs.players)) {
      this.pendingPenguinLoads.add(id);
    }

    const uniqueSkins = [
      ...new Set(Object.values(gs.players).map((player) => player.skin)),
    ];

    await Promise.all([
      this.loadMapBlockTemplate(),
      this.loadEnvironment(gs.map.type),
      ...uniqueSkins.map((skin) => this.loadSkin(skin)),
    ]);

    this.buildPlatform(gs.map.length, gs.map.width);
    this.renderedMapLength = gs.map.length;
    this.renderedMapWidth = gs.map.width;

    await this.loadPenguins(gs);
  }

  private async loadMapBlockTemplate() {
    try {
      const result = await SceneLoader.ImportMeshAsync(
        "",
        "/assets/",
        "MapBlock.glb",
        this.scene,
      );
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
            const clone = (orig as Mesh).clone(
              `tile_${ix}_${iz}_${orig.name}`,
              this.platformRoot,
            );
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
      const platform = MeshBuilder.CreateBox(
        "platform_fallback",
        {
          width: mapLength,
          height: 0.5,
          depth: mapWidth,
        },
        this.scene,
      );
      platform.position.y = -0.25;
      const mat = new StandardMaterial("platformMat", this.scene);
      mat.diffuseColor = new Color3(0.75, 0.82, 0.88);
      mat.specularColor = new Color3(0.2, 0.25, 0.3);
      platform.material = mat;
      platform.receiveShadows = true;
      platform.parent = this.platformRoot;
    }

    // Platform edge walls (ice thickness)
    const halfL = mapLength / 2;
    const halfW = mapWidth / 2;
    const edgeH = 2.5;
    const edgeThickness = 0.6;
    const edgeMat = new StandardMaterial("edgeMat", this.scene);
    edgeMat.diffuseColor = new Color3(0.78, 0.9, 0.96);
    edgeMat.specularColor = new Color3(0.4, 0.45, 0.5);
    edgeMat.alpha = 0.92;

    const edges = [
      {
        name: "edge_n",
        w: mapLength + edgeThickness,
        d: edgeThickness,
        x: 0,
        z: halfW + edgeThickness / 2,
      },
      {
        name: "edge_s",
        w: mapLength + edgeThickness,
        d: edgeThickness,
        x: 0,
        z: -halfW - edgeThickness / 2,
      },
      {
        name: "edge_e",
        w: edgeThickness,
        d: mapWidth + edgeThickness,
        x: halfL + edgeThickness / 2,
        z: 0,
      },
      {
        name: "edge_w",
        w: edgeThickness,
        d: mapWidth + edgeThickness,
        x: -halfL - edgeThickness / 2,
        z: 0,
      },
    ];
    for (const e of edges) {
      const wall = MeshBuilder.CreateBox(
        e.name,
        {
          width: e.w,
          height: edgeH,
          depth: e.d,
        },
        this.scene,
      );
      wall.position = new Vector3(e.x, -edgeH / 2 + 0.15, e.z);
      wall.material = edgeMat;
      wall.receiveShadows = true;
      wall.parent = this.platformRoot;
    }

    // Underside slab (visible ice block depth)
    const underside = MeshBuilder.CreateBox(
      "platform_under",
      {
        width: mapLength + edgeThickness * 2,
        height: 0.8,
        depth: mapWidth + edgeThickness * 2,
      },
      this.scene,
    );
    underside.position.y = -edgeH + 0.55;
    const undersideMat = new StandardMaterial("undersideMat", this.scene);
    undersideMat.diffuseColor = new Color3(0.65, 0.82, 0.92);
    undersideMat.alpha = 0.85;
    underside.material = undersideMat;
    underside.receiveShadows = true;
    underside.parent = this.platformRoot;
  }

  private async loadEnvironment(mapType: string) {
    const glbPath = mapToEnvironmentGlb(mapType);
    try {
      const result = await SceneLoader.ImportMeshAsync(
        "",
        "",
        glbPath,
        this.scene,
      );
      this.environmentRoot = new TransformNode("env", this.scene);
      for (const m of result.meshes) {
        m.parent = this.environmentRoot;
      }
      this.environmentRoot.position = new Vector3(0, 0, 0);
      this.environmentRoot.scaling = new Vector3(1, 1, 1);

      // Find spectator stage (SpecFloor or SpecBase) for lobby/eliminated positioning
      const specFloor = result.meshes.find(
        (m) => m.name === "SpecFloor" || m.name === "SpecBase",
      );
      if (specFloor) {
        specFloor.computeWorldMatrix(true);
        const absPos = specFloor.getAbsolutePosition();
        this.stageCenter = absPos.clone();

        // Compute stage bounds from bounding box
        const bb = specFloor.getBoundingInfo().boundingBox;
        const minW = Vector3.TransformCoordinates(
          bb.minimum,
          specFloor.getWorldMatrix(),
        );
        const maxW = Vector3.TransformCoordinates(
          bb.maximum,
          specFloor.getWorldMatrix(),
        );
        this.stageY = maxW.y + 0.5; // stand on top surface of the floor
        this.stageHalfX = Math.abs(maxW.x - minW.x) / 2 - 0.5;
        this.stageHalfZ = Math.abs(maxW.z - minW.z) / 2 - 0.5;
      }
    } catch (e) {
      console.warn("Failed to load environment", glbPath, e);
    }
  }

  private async loadSkin(skin: string): Promise<AbstractMesh[]> {
    if (this.skinCache.has(skin)) return this.skinCache.get(skin)!;

    const glbPath = skinToGlb(skin);
    try {
      const result = await SceneLoader.ImportMeshAsync(
        "",
        "",
        glbPath,
        this.scene,
      );
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

      // Position from server (map coordinates → world coordinates)
      const cx = penguin.position.x - mapCenterX;
      const cz = penguin.position.z - mapCenterZ;
      const y = 0.5;
      root.position = new Vector3(cx, y, cz);

      // Clone meshes — skip meshes whose parent is another template mesh
      // (they'll be auto-cloned by Mesh.clone), but DO clone meshes parented
      // to TransformNodes or other non-mesh nodes (not in the template array)
      const clonedMeshes: AbstractMesh[] = [];
      const templateSet = new Set(templateMeshes);
      for (const orig of templateMeshes) {
        if (!orig.name || orig.name === "__root__") continue;
        // If parent is another template mesh (not __root__), skip — auto-cloned by parent
        if (
          orig.parent &&
          orig.parent.name !== "__root__" &&
          templateSet.has(orig.parent as AbstractMesh)
        )
          continue;
        const clone = (orig as Mesh).clone(`${id}_${orig.name}`, root);
        if (!clone) continue;
        clone.setEnabled(true);
        clone.scaling = new Vector3(1.2, 1.2, 1.2);
        clone.receiveShadows = true;
        if (this.shadowGen) {
          this.shadowGen.addShadowCaster(clone);
        }
        clonedMeshes.push(clone);
        // Enable auto-cloned children
        for (const child of clone.getChildMeshes(false)) {
          child.setEnabled(true);
          child.receiveShadows = true;
          if (this.shadowGen) this.shadowGen.addShadowCaster(child);
          clonedMeshes.push(child);
        }
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
        const ring = MeshBuilder.CreateTorus(
          `ring_${id}`,
          {
            diameter: 2.0,
            thickness: 0.15,
            tessellation: 32,
          },
          this.scene,
        );
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
        isEliminated: false,
      });
      this.pendingPenguinLoads.delete(id);
    }
  }

  /* ── Rebuild platform when map shrinks ── */
  private rebuildPlatform(newLength: number, newWidth: number) {
    if (this.platformRoot) {
      this.platformRoot.getChildMeshes(false).forEach((m) => m.dispose());
      this.platformRoot.dispose();
      this.platformRoot = null;
    }
    this.mapTiles = [];
    this.buildPlatform(newLength, newWidth);
    this.renderedMapLength = newLength;
    this.renderedMapWidth = newWidth;
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

    const wantsCameraControls =
      phase === "lobby" || phase === "animating" || phase === "playing";
    if (wantsCameraControls !== this.cameraControlsAttached) {
      const canvas = this.engine.getRenderingCanvas();
      if (canvas) {
        if (wantsCameraControls) {
          this.camera.attachControl(canvas, true);
        } else {
          this.camera.detachControl();
        }
      }
      this.cameraControlsAttached = wantsCameraControls;
    }

    // Detect map shrink → rebuild platform
    if (
      this.renderedMapLength > 0 &&
      (gs.map.length !== this.renderedMapLength ||
        gs.map.width !== this.renderedMapWidth)
    ) {
      this.rebuildPlatform(gs.map.length, gs.map.width);
    }

    // Reset lobbyPos when leaving lobby
    if (this.lastPhase === "lobby" && phase !== "lobby") {
      this.lobbyPos = null;
    }

    // Lobby phase: WASD movement on the map
    if (phase === "lobby") {
      this.lobbyTime += dt;

      // Initialize lobbyPos from server position
      if (this.lobbyPos === null) {
        const myPenguin = gs.players[this.playerId];
        if (myPenguin) {
          this.lobbyPos = { x: myPenguin.position.x, z: myPenguin.position.z };
        } else {
          this.lobbyPos = { x: gs.map.length / 2, z: gs.map.width / 2 };
        }
      }
      const myPenguin = gs.players[this.playerId];

      const LOBBY_SPEED = 8;
      const mapLen = gs.map.length;
      const mapWid = gs.map.width;

      // Camera-relative forward/right in XZ
      const camAlpha = this.camera.alpha;
      const fwdX = -Math.cos(camAlpha);
      const fwdZ = -Math.sin(camAlpha);
      const rightX = -Math.sin(camAlpha);
      const rightZ = Math.cos(camAlpha);

      let moveX = 0;
      let moveZ = 0;
      if (this.lobbyKeys.w) {
        moveX += fwdX;
        moveZ += fwdZ;
      }
      if (this.lobbyKeys.s) {
        moveX -= fwdX;
        moveZ -= fwdZ;
      }
      if (this.lobbyKeys.d) {
        moveX += rightX;
        moveZ += rightZ;
      }
      if (this.lobbyKeys.a) {
        moveX -= rightX;
        moveZ -= rightZ;
      }

      const len = Math.hypot(moveX, moveZ);
      if (len > 0) {
        moveX = (moveX / len) * LOBBY_SPEED * dt;
        moveZ = (moveZ / len) * LOBBY_SPEED * dt;
        this.lobbyPos.x = Math.max(
          1,
          Math.min(mapLen - 1, this.lobbyPos.x + moveX),
        );
        this.lobbyPos.z = Math.max(
          1,
          Math.min(mapWid - 1, this.lobbyPos.z + moveZ),
        );
      }

      let moveDirection = myPenguin?.direction ?? 0;
      if (len > 0) {
        moveDirection =
          (((Math.atan2(moveZ, moveX) * 180) / Math.PI) + 360) % 360;
      }

      if (myPenguin) {
        const authDx = myPenguin.position.x - this.lobbyPos.x;
        const authDz = myPenguin.position.z - this.lobbyPos.z;
        if (len === 0 || Math.hypot(authDx, authDz) > 1.5) {
          this.lobbyPos.x = myPenguin.position.x;
          this.lobbyPos.z = myPenguin.position.z;
        }
      }

      // Send position to server (throttled to ~30/sec)
      const now = performance.now();
      if (len > 0 && now - this.lastPosSendTime > 33) {
        this.lastPosSendTime = now;
        sendPosition({
          x: this.lobbyPos.x,
          z: this.lobbyPos.z,
          direction: moveDirection,
        });
      }

      // Camera follows player
      const camTargetPlayer = myPenguin ?? gs.players[this.playerId];
      const camTarget = new Vector3(
        (camTargetPlayer?.position.x ?? this.lobbyPos.x) - mapCenterX,
        1.5,
        (camTargetPlayer?.position.z ?? this.lobbyPos.z) - mapCenterZ,
      );
      const blend = 1 - Math.exp(-5 * dt);
      this.camera.target.x += (camTarget.x - this.camera.target.x) * blend;
      this.camera.target.y += (camTarget.y - this.camera.target.y) * blend;
      this.camera.target.z += (camTarget.z - this.camera.target.z) * blend;
      // Soft radius blend — don't force beta so player can look up/down freely
      const targetRadius = 15;
      this.camera.radius += (targetRadius - this.camera.radius) * blend * 0.3;

      // Fall through to penguin update loop (no return)
    }

    // Update each penguin
    for (const [id, tracker] of this.penguins) {
      const penguin = gs.players[id];
      if (!penguin) continue;

      const isCurrentPlayer = id === this.playerId;

      // All players use server positions (map coordinates → world)
      const cx = penguin.position.x - mapCenterX;
      const cz = penguin.position.z - mapCenterZ;
      const y = 0.5;

      if (phase === "lobby") {
        tracker.root.position.set(cx, y, cz);
        tracker.interpFrom.set(cx, y, cz);
        tracker.interpTo.set(cx, y, cz);
        tracker.interpT = 1;
        tracker.lastX = cx;
        tracker.lastZ = cz;
        tracker.lastY = y;
      } else if (
        cx !== tracker.lastX ||
        cz !== tracker.lastZ ||
        y !== tracker.lastY
      ) {
        tracker.interpFrom.copyFrom(tracker.root.position);
        tracker.interpTo.set(cx, y, cz);
        tracker.interpT = 0;
        tracker.lastX = cx;
        tracker.lastZ = cz;
        tracker.lastY = y;
      }

      // Smooth position interpolation
      if (phase !== "lobby" && tracker.interpT < 1) {
        tracker.interpT = Math.min(
          1,
          tracker.interpT + dt / SERVER_INTERP_DURATION,
        );
        const t = tracker.interpT * tracker.interpT * (3 - 2 * tracker.interpT);
        Vector3.LerpToRef(
          tracker.interpFrom,
          tracker.interpTo,
          t,
          tracker.root.position,
        );
      } else if (phase !== "lobby") {
        // Gently hold at target
        const blend = 1 - Math.exp(-10 * dt);
        tracker.root.position.x +=
          (tracker.interpTo.x - tracker.root.position.x) * blend;
        tracker.root.position.y +=
          (tracker.interpTo.y - tracker.root.position.y) * blend;
        tracker.root.position.z +=
          (tracker.interpTo.z - tracker.root.position.z) * blend;
      }

      // Eliminated player transparency
      if (penguin.eliminated > 0 && !tracker.isEliminated) {
        tracker.isEliminated = true;
        for (const m of tracker.meshes) {
          if (m.material) {
            const clonedMat = m.material.clone(`${id}_mat_elim`);
            if (clonedMat) {
              clonedMat.alpha = 0.35;
              if ("needDepthPrePass" in clonedMat) {
                (
                  clonedMat as unknown as Record<string, unknown>
                ).needDepthPrePass = true;
              }
              m.material = clonedMat;
            }
          }
        }
        tracker.arrow.setEnabled(false);
      }

      // Rotation: penguin model faces +Z. rotation.y = θ maps +Z to (sin(θ), cos(θ))
      // Physics dir 0° = +X → targetRotY = -rad + π/2
      const dir =
        isCurrentPlayer && phase === "countdown"
          ? store.aimDirection
          : penguin.direction;
      const rad = (dir * Math.PI) / 180;
      const targetRotY = -rad + Math.PI / 2;

      if (phase === "lobby") {
        tracker.currentRotY = targetRotY;
      } else if (!isCurrentPlayer && phase === "countdown") {
        tracker.currentRotY = targetRotY;
      } else {
        let diff = targetRotY - tracker.currentRotY;
        // Normalize diff to [-π, π]
        while (diff > Math.PI) diff -= 2 * Math.PI;
        while (diff < -Math.PI) diff += 2 * Math.PI;
        const rotationSpeed = phase === "animating" ? 14 : 10;
        tracker.currentRotY += diff * (1 - Math.exp(-rotationSpeed * dt));
      }
      tracker.root.rotation.y = tracker.currentRotY;

      // Arrow visibility — hide during lobby and for eliminated players
      if (tracker.isEliminated) {
        tracker.arrow.setEnabled(false);
      } else {
        const showArrow =
          (phase === "countdown" || phase === "animating") &&
          penguin.eliminated === 0;
        tracker.arrow.setEnabled(showArrow);
        if (showArrow) {
          const power = isCurrentPlayer ? store.aimPower : 6;
          const scale = 0.6 + (power / 10) * 1.5;
          tracker.arrow.scaling.z = scale;
          tracker.arrow.position.y =
            2.8 + Math.sin(performance.now() / 333) * 0.1;
        }
      }
    }

    // Camera follow during gameplay (skip during lobby — handled above)
    if (phase !== "lobby") {
      const player = gs.players[this.playerId];
      const playerTracker = this.penguins.get(this.playerId);
      if (player && player.eliminated === 0) {
        const target = playerTracker
          ? new Vector3(
              playerTracker.root.position.x,
              1,
              playerTracker.root.position.z,
            )
          : new Vector3(
              player.position.x - mapCenterX,
              1,
              player.position.z - mapCenterZ,
            );

        const smoothSpeed = phase === "countdown" ? 5 : 3;
        const blend = 1 - Math.exp(-smoothSpeed * dt);
        this.camera.target.x += (target.x - this.camera.target.x) * blend;
        this.camera.target.y += (target.y - this.camera.target.y) * blend;
        this.camera.target.z += (target.z - this.camera.target.z) * blend;

        if (phase === "countdown") {
          const targetAlpha = (store.aimDirection * Math.PI) / 180 - Math.PI;
          let alphaDiff = targetAlpha - this.camera.alpha;
          while (alphaDiff > Math.PI) alphaDiff -= 2 * Math.PI;
          while (alphaDiff < -Math.PI) alphaDiff += 2 * Math.PI;
          this.camera.alpha += alphaDiff * (1 - Math.exp(-8 * dt));
          this.camera.radius +=
            (COUNTDOWN_CAMERA_RADIUS - this.camera.radius) * blend;
          this.camera.beta += (FOLLOW_CAMERA_BETA - this.camera.beta) * blend;
        } else if (phase === "playing") {
          this.camera.radius +=
            (FOLLOW_CAMERA_RADIUS - this.camera.radius) * blend * 0.35;
        }
      } else {
        // Spectator: look at center
        const blend = 1 - Math.exp(-2 * dt);
        this.camera.target.x += (0 - this.camera.target.x) * blend;
        this.camera.target.y += (1 - this.camera.target.y) * blend;
        this.camera.target.z += (0 - this.camera.target.z) * blend;
      }
    }

    this.lastPhase = phase;

    // Handle new players joining
    this.syncPlayers(gs);
  }

  /* ── Sync players: add new ones that joined mid-game ── */
  private syncPlayers(gs: import("@/lib/types").GameState) {
    for (const id of Object.keys(gs.players)) {
      if (!this.penguins.has(id) && !this.pendingPenguinLoads.has(id)) {
        // New player appeared — load their penguin
        this.loadPenguinSingle(id, gs).catch(console.warn);
      }
    }
  }

  private async loadPenguinSingle(
    id: string,
    gs: import("@/lib/types").GameState,
  ) {
    const penguin = gs.players[id];
    if (!penguin || this.penguins.has(id) || this.pendingPenguinLoads.has(id))
      return;
    this.pendingPenguinLoads.add(id);

    const mapCenterX = gs.map.length / 2;
    const mapCenterZ = gs.map.width / 2;

    const templateMeshes = await this.loadSkin(penguin.skin);
    if (templateMeshes.length === 0) return;

    const isCurrentPlayer = id === this.playerId;
    const root = new TransformNode(`penguin_${id}`, this.scene);

    const phase = useGameStore.getState().phase;
    const cx = penguin.position.x - mapCenterX;
    const cz = penguin.position.z - mapCenterZ;
    const y = 0.5;
    root.position = new Vector3(cx, y, cz);

    const clonedMeshes: AbstractMesh[] = [];
    const templateSet = new Set(templateMeshes);
    for (const orig of templateMeshes) {
      if (!orig.name || orig.name === "__root__") continue;
      if (
        orig.parent &&
        orig.parent.name !== "__root__" &&
        templateSet.has(orig.parent as AbstractMesh)
      )
        continue;
      const clone = (orig as Mesh).clone(`${id}_${orig.name}`, root);
      if (!clone) continue;
      clone.setEnabled(true);
      clone.scaling = new Vector3(1.2, 1.2, 1.2);
      clone.receiveShadows = true;
      if (this.shadowGen) this.shadowGen.addShadowCaster(clone);
      clonedMeshes.push(clone);
      for (const child of clone.getChildMeshes(false)) {
        child.setEnabled(true);
        child.receiveShadows = true;
        if (this.shadowGen) this.shadowGen.addShadowCaster(child);
        clonedMeshes.push(child);
      }
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
      isEliminated: false,
    });
    this.pendingPenguinLoads.delete(id);
  }
  dispose() {
    this.disposed = true;
    if (this.lobbyKeyHandler)
      window.removeEventListener("keydown", this.lobbyKeyHandler);
    if (this.lobbyKeyUpHandler)
      window.removeEventListener("keyup", this.lobbyKeyUpHandler);
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
  const [isSceneReady, setIsSceneReady] = useState(false);

  // Create scene when gameState becomes available; guard prevents re-creation
  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    if (!canvas || sceneRef.current) return;

    const gs = useGameStore.getState().gameState;
    if (!gs) return;

    const scene = new GameScene(canvas, playerId);
    sceneRef.current = scene;
    setIsSceneReady(true);
    scene
      .init()
      .then(() => {
        if (!cancelled) {
          setIsSceneReady(true);
        }
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) {
          setIsSceneReady(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [playerId, gameState]);

  // Dispose scene only on unmount
  useEffect(() => {
    return () => {
      if (sceneRef.current) {
        sceneRef.current.dispose();
        sceneRef.current = null;
      }
    };
  }, []);

  if (!gameState) return null;

  if (webglAvailable === false) {
    return (
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
        }}
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
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
        }}
        className="flex items-center justify-center bg-[#0a0a0f]"
      >
        <div className="text-white/40 text-sm">Initializing 3D arena...</div>
      </div>
    );
  }

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
      }}
    >
      <CanvasErrorBoundary>
        <canvas
          ref={canvasRef}
          style={{
            width: "100%",
            height: "100%",
            display: "block",
            touchAction: "none",
          }}
        />
      </CanvasErrorBoundary>
      {!isSceneReady && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-4 py-2 backdrop-blur-sm">
          <div className="text-center">
            <p className="text-white/70 text-xs font-medium">
              Loading arena assets...
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
