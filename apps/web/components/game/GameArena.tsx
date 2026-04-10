"use client";

import { useRef, useEffect, useState, Component, type ReactNode } from "react";
import { useGameStore } from "@/lib/game-store";
import { skinToGlb, mapToEnvironmentGlb } from "@/lib/constants";
import { registerMove, sendPosition } from "@/lib/ws";
import { mobileInput } from "@/lib/mobile-input";

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
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture.js";
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
  nameplate: Mesh;
  interpFrom: Vector3;
  interpTo: Vector3;
  interpT: number;
  lastX: number;
  lastZ: number;
  lastY: number;
  currentRotY: number;
  isEliminated: boolean;
  fallStartAt: number | null;
  fallOrigin: Vector3 | null;
  fallStageTarget: Vector3 | null;
}

const SERVER_INTERP_DURATION = 0.05;
const FOLLOW_CAMERA_BETA = 1.08;
const FOLLOW_CAMERA_RADIUS = 13;
const COUNTDOWN_CAMERA_RADIUS = 11.5;
const COUNTDOWN_MOUSE_TURN_DEG_PER_PX = 0.35;
const ELIMINATION_FALL_DURATION_MS = 1100;

function normalizeDegrees(value: number) {
  return ((value % 360) + 360) % 360;
}

function shortestAngleDeltaDeg(target: number, current: number) {
  let delta = normalizeDegrees(target) - normalizeDegrees(current);
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return delta;
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
/*  Build a nameplate billboard (DynamicTexture on a plane)            */
/* ------------------------------------------------------------------ */
function penguinDisplayName(penguin: import("@/lib/types").Penguin): string {
  if (penguin.username) return penguin.username;
  if (penguin.id.startsWith("anonymous_")) return penguin.id.slice(10);
  return penguin.id;
}

function createNameplate(
  scene: Scene,
  name: string,
  displayText: string,
  isCurrentPlayer: boolean,
): Mesh {
  const texWidth = 512;
  const texHeight = 96;

  const texture = new DynamicTexture(`${name}_tex`, { width: texWidth, height: texHeight }, scene, false);
  texture.hasAlpha = true;

  const ctx = texture.getContext() as unknown as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, texWidth, texHeight);

  // Draw rounded background
  const bgHeight = 56;
  const bgY = (texHeight - bgHeight) / 2;
  const radius = bgHeight / 2;

  // Measure text to size background
  ctx.font = "bold 34px Arial, sans-serif";
  const textMetrics = ctx.measureText(displayText);
  const textWidth = textMetrics.width;
  const bgWidth = Math.min(texWidth - 40, textWidth + 50);
  const bgX = (texWidth - bgWidth) / 2;

  // Draw rounded rect manually for compatibility
  ctx.beginPath();
  ctx.moveTo(bgX + radius, bgY);
  ctx.lineTo(bgX + bgWidth - radius, bgY);
  ctx.arc(bgX + bgWidth - radius, bgY + radius, radius, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(bgX + radius, bgY + bgHeight);
  ctx.arc(bgX + radius, bgY + radius, radius, Math.PI / 2, -Math.PI / 2);
  ctx.closePath();
  ctx.fillStyle = isCurrentPlayer
    ? "rgba(0, 180, 255, 0.7)"
    : "rgba(0, 0, 0, 0.65)";
  ctx.fill();

  // Draw text
  ctx.font = "bold 34px Arial, sans-serif";
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(displayText, texWidth / 2, texHeight / 2, bgWidth - 20);

  texture.update();

  // Create plane mesh
  const planeWidth = 3.0;
  const planeHeight = planeWidth * (texHeight / texWidth);
  const plane = MeshBuilder.CreatePlane(`${name}_plane`, { width: planeWidth, height: planeHeight }, scene);
  plane.position.y = 3.8;
  plane.billboardMode = 7; // BILLBOARDMODE_ALL

  const mat = new StandardMaterial(`${name}_mat`, scene);
  mat.diffuseTexture = texture;
  mat.emissiveTexture = texture;
  mat.opacityTexture = texture;
  mat.disableLighting = true;
  mat.backFaceCulling = false;
  plane.material = mat;
  plane.isPickable = false;

  return plane;
}
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
  private lobbyDirection: number | null = null;
  private lastLobbyMoveAt: number = 0;
  private lobbyWasMoving = false;
  private lobbyKeyHandler: ((e: KeyboardEvent) => void) | null = null;
  private lobbyKeyUpHandler: ((e: KeyboardEvent) => void) | null = null;

  // Map shrinking tracking
  private renderedMapLength: number = 0;
  private renderedMapWidth: number = 0;
  private platformBaseLength: number = 0;
  private platformBaseWidth: number = 0;
  private platformScaleX: number = 1;
  private platformScaleZ: number = 1;
  private platformTargetScaleX: number = 1;
  private platformTargetScaleZ: number = 1;

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
      if (!this.canCurrentPlayerAim()) return;
      this.countdownPointerActive = true;
      this.lastCountdownPointerX = e.clientX;
    };
    this.countdownPointerMoveHandler = (e: PointerEvent) => {
      if (!this.countdownPointerActive) return;
      const lastX = this.lastCountdownPointerX ?? e.clientX;
      const dx = e.clientX - lastX;
      this.lastCountdownPointerX = e.clientX;
      if (Math.abs(dx) < 0.1) return;

      if (!this.canCurrentPlayerAim()) {
        this.countdownPointerActive = false;
        this.lastCountdownPointerX = null;
        return;
      }

      const store = useGameStore.getState();
      const nextAimDirection = normalizeDegrees(
        store.aimDirection + dx * COUNTDOWN_MOUSE_TURN_DEG_PER_PX,
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
    this.platformRoot.scaling = new Vector3(1, 1, 1);

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

  private getStageCenter(gs: import("@/lib/types").GameState) {
    if (this.stageCenter) return this.stageCenter;
    return new Vector3(-(gs.map.length / 2) - 8, this.stageY, 0);
  }

  private stageLocalToWorld(
    local: { x: number; z: number } | undefined,
    gs: import("@/lib/types").GameState,
  ) {
    const stageCenter = this.getStageCenter(gs);
    return new Vector3(
      stageCenter.x + (local?.x ?? 0),
      this.stageY,
      stageCenter.z + (local?.z ?? 0),
    );
  }

  private clampStageLocalPosition(local: { x: number; z: number }) {
    const margin = 0.55;
    return {
      x: Math.max(
        -this.stageHalfX + margin,
        Math.min(this.stageHalfX - margin, local.x),
      ),
      z: Math.max(
        -this.stageHalfZ + margin,
        Math.min(this.stageHalfZ - margin, local.z),
      ),
    };
  }

  private resolvePenguinWorldPosition(
    penguin: import("@/lib/types").Penguin,
    gs: import("@/lib/types").GameState,
  ) {
    if (penguin.zone === "stage") {
      return this.stageLocalToWorld(penguin.stage_position, gs);
    }

    return new Vector3(
      penguin.position.x - gs.map.length / 2,
      0.5,
      penguin.position.z - gs.map.width / 2,
    );
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
    for (const [id, penguin] of Object.entries(gs.players)) {
      const templateMeshes = await this.loadSkin(penguin.skin);
      if (templateMeshes.length === 0) continue;

      const isCurrentPlayer = id === this.playerId;
      const root = new TransformNode(`penguin_${id}`, this.scene);

      const worldPosition = this.resolvePenguinWorldPosition(penguin, gs);
      root.position = worldPosition.clone();

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

      // Nameplate billboard
      const displayText = penguinDisplayName(penguin);
      const nameplate = createNameplate(this.scene, `nameplate_${id}`, displayText, isCurrentPlayer);
      nameplate.parent = root;

      const rad = (penguin.direction * Math.PI) / 180;
      const initRotY = -rad + Math.PI / 2;

      this.penguins.set(id, {
        root,
        meshes: clonedMeshes,
        arrow,
        nameplate,
        interpFrom: worldPosition.clone(),
        interpTo: worldPosition.clone(),
        interpT: 1,
        lastX: worldPosition.x,
        lastZ: worldPosition.z,
        lastY: worldPosition.y,
        currentRotY: initRotY,
        isEliminated: false,
        fallStartAt: null,
        fallOrigin: null,
        fallStageTarget: null,
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
    this.platformBaseLength = newLength;
    this.platformBaseWidth = newWidth;
    this.platformScaleX = 1;
    this.platformScaleZ = 1;
    this.platformTargetScaleX = 1;
    this.platformTargetScaleZ = 1;
    this.renderedMapLength = newLength;
    this.renderedMapWidth = newWidth;
  }

  private canCurrentPlayerAim() {
    const store = useGameStore.getState();
    const penguin = store.gameState?.players[this.playerId];
    return (
      store.phase === "countdown" &&
      !!penguin &&
      penguin.eliminated === 0 &&
      penguin.zone !== "stage"
    );
  }

  private setPlatformTargetSize(length: number, width: number) {
    this.renderedMapLength = length;
    this.renderedMapWidth = width;
    this.platformTargetScaleX =
      this.platformBaseLength > 0 ? length / this.platformBaseLength : 1;
    this.platformTargetScaleZ =
      this.platformBaseWidth > 0 ? width / this.platformBaseWidth : 1;
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
    const localPlayer = gs.players[this.playerId];
    const stageMovementActive = !!localPlayer && localPlayer.zone === "stage";
    const localPlayerOnStage =
      !!localPlayer && localPlayer.zone === "stage" && localPlayer.eliminated > 0;

    const wantsCameraControls =
      phase === "lobby" ||
      phase === "animating" ||
      phase === "playing" ||
      (phase === "countdown" && localPlayerOnStage);
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

    // Grow/reset maps by rebuilding geometry; shrink active maps by animating scale.
    if (
      this.renderedMapLength > 0 &&
      (gs.map.length !== this.renderedMapLength ||
        gs.map.width !== this.renderedMapWidth)
    ) {
      const growsOrResets =
        phase === "lobby" ||
        gs.map.length > this.renderedMapLength ||
        gs.map.width > this.renderedMapWidth ||
        this.platformBaseLength === 0 ||
        this.platformBaseWidth === 0;

      if (growsOrResets) {
        this.rebuildPlatform(gs.map.length, gs.map.width);
      } else {
        this.setPlatformTargetSize(gs.map.length, gs.map.width);
      }
    }

    if (this.platformRoot) {
      const blend = 1 - Math.exp(-8 * dt);
      this.platformScaleX += (this.platformTargetScaleX - this.platformScaleX) * blend;
      this.platformScaleZ += (this.platformTargetScaleZ - this.platformScaleZ) * blend;
      this.platformRoot.scaling.x = this.platformScaleX;
      this.platformRoot.scaling.z = this.platformScaleZ;
    }

    // Reset predicted stage motion once the local player is back on the map.
    if (this.lobbyPos !== null && !stageMovementActive) {
      this.lobbyPos = null;
      this.lobbyDirection = null;
      this.lastLobbyMoveAt = 0;
      this.lobbyWasMoving = false;
    }

    // Stage movement: lobby walkers and knocked-out spectators share the same area.
    if (stageMovementActive) {
      // Initialize predicted stage motion from authoritative server state.
      if (this.lobbyPos === null) {
        const myPenguin = gs.players[this.playerId];
        this.lobbyPos = {
          x: myPenguin?.stage_position?.x ?? 0,
          z: myPenguin?.stage_position?.z ?? 0,
        };
        this.lobbyDirection = myPenguin?.direction ?? 0;
      }
      const myPenguin = localPlayer;

      const stageSpeed = myPenguin?.eliminated > 0 ? 7 : 8;

      // Camera-relative forward/right on the stage plane
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

      // Mobile joystick input
      if (mobileInput.active) {
        moveX += fwdX * (-mobileInput.moveZ) + rightX * mobileInput.moveX;
        moveZ += fwdZ * (-mobileInput.moveZ) + rightZ * mobileInput.moveX;
      }

      const len = Math.hypot(moveX, moveZ);
      const now = performance.now();
      const wasMoving = this.lobbyWasMoving;
      const startedMoving = len > 0 && !wasMoving;
      const stoppedMoving = len === 0 && wasMoving;
      if (len > 0) {
        moveX = (moveX / len) * stageSpeed * dt;
        moveZ = (moveZ / len) * stageSpeed * dt;
        this.lobbyPos = this.clampStageLocalPosition({
          x: this.lobbyPos.x + moveX,
          z: this.lobbyPos.z + moveZ,
        });
        this.lastLobbyMoveAt = now;
      }

      let moveDirection = myPenguin?.direction ?? 0;
      if (len > 0) {
        moveDirection =
          (((Math.atan2(moveZ, moveX) * 180) / Math.PI) + 360) % 360;
        this.lobbyDirection = moveDirection;
      }

      if (myPenguin) {
        const authPos = {
          x: myPenguin.stage_position?.x ?? 0,
          z: myPenguin.stage_position?.z ?? 0,
        };
        const authDx = authPos.x - this.lobbyPos.x;
        const authDz = authPos.z - this.lobbyPos.z;
        const authDistance = Math.hypot(authDx, authDz);
        const authDirection = myPenguin.direction ?? 0;
        const recentlyMoved = now - this.lastLobbyMoveAt < 160;

        if (len === 0 && !recentlyMoved) {
          const correctionBlend = 1 - Math.exp(-14 * dt);
          this.lobbyPos.x += authDx * correctionBlend;
          this.lobbyPos.z += authDz * correctionBlend;
          const currentDir = this.lobbyDirection ?? authDirection;
          this.lobbyDirection = normalizeDegrees(
            currentDir +
              shortestAngleDeltaDeg(authDirection, currentDir) * correctionBlend,
          );
        } else if (authDistance > 6) {
          this.lobbyPos.x = authPos.x;
          this.lobbyPos.z = authPos.z;
          this.lobbyDirection = authDirection;
        }
      }

      // Send stage position on movement start, while moving, and once more on stop.
      if (
        (len > 0 && (startedMoving || now - this.lastPosSendTime > 33)) ||
        stoppedMoving
      ) {
        this.lastPosSendTime = now;
        sendPosition({
          x: this.lobbyPos.x,
          z: this.lobbyPos.z,
          direction: this.lobbyDirection ?? moveDirection,
        });
      }
      this.lobbyWasMoving = len > 0;

      // Camera follows player
      const camTarget = this.stageLocalToWorld(this.lobbyPos, gs);
      camTarget.y = this.stageY + 1;
      const blend = 1 - Math.exp(-5 * dt);
      this.camera.target.x += (camTarget.x - this.camera.target.x) * blend;
      this.camera.target.y += (camTarget.y - this.camera.target.y) * blend;
      this.camera.target.z += (camTarget.z - this.camera.target.z) * blend;
      const targetRadius = 12;
      this.camera.radius += (targetRadius - this.camera.radius) * blend * 0.3;

      // Fall through to penguin update loop (no return)
    }

    // Update each penguin
    for (const [id, tracker] of this.penguins) {
      const penguin = gs.players[id];
      if (!penguin) continue;

      const isCurrentPlayer = id === this.playerId;
      const targetWorld =
        stageMovementActive && isCurrentPlayer && this.lobbyPos
          ? this.stageLocalToWorld(this.lobbyPos, gs)
          : this.resolvePenguinWorldPosition(penguin, gs);
      const cx = targetWorld.x;
      const cz = targetWorld.z;
      const y = targetWorld.y;

      if (penguin.eliminated > 0 && !tracker.isEliminated) {
        tracker.isEliminated = true;
        tracker.fallStartAt = performance.now();
        tracker.fallOrigin = tracker.root.position.clone();
        tracker.fallStageTarget =
          penguin.zone === "stage" ? targetWorld.clone() : null;
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

      if ((stageMovementActive && isCurrentPlayer) || phase === "lobby") {
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

      const fallElapsed =
        tracker.fallStartAt === null ? null : performance.now() - tracker.fallStartAt;
      const isFalling =
        fallElapsed !== null && fallElapsed < ELIMINATION_FALL_DURATION_MS;

      if (phase !== "lobby" && !isFalling && tracker.interpT < 1) {
        tracker.interpT = Math.min(1, tracker.interpT + dt / SERVER_INTERP_DURATION);
        const t = tracker.interpT * tracker.interpT * (3 - 2 * tracker.interpT);
        Vector3.LerpToRef(tracker.interpFrom, tracker.interpTo, t, tracker.root.position);
      } else if (phase !== "lobby" && !isFalling) {
        const blend = 1 - Math.exp(-10 * dt);
        tracker.root.position.x += (tracker.interpTo.x - tracker.root.position.x) * blend;
        tracker.root.position.y += (tracker.interpTo.y - tracker.root.position.y) * blend;
        tracker.root.position.z += (tracker.interpTo.z - tracker.root.position.z) * blend;
      }

      if (isFalling && tracker.fallOrigin) {
        const t = Math.min(1, fallElapsed! / ELIMINATION_FALL_DURATION_MS);
        tracker.root.position.x = tracker.fallOrigin.x;
        tracker.root.position.z = tracker.fallOrigin.z;
        tracker.root.position.y = tracker.fallOrigin.y - 8 * t * t;
      } else if (tracker.fallStartAt !== null) {
        tracker.fallStartAt = null;
        tracker.fallOrigin = null;
        if (tracker.fallStageTarget) {
          tracker.root.position.copyFrom(tracker.fallStageTarget);
          tracker.interpFrom.copyFrom(tracker.fallStageTarget);
          tracker.interpTo.copyFrom(tracker.fallStageTarget);
          tracker.lastX = tracker.fallStageTarget.x;
          tracker.lastZ = tracker.fallStageTarget.z;
          tracker.lastY = tracker.fallStageTarget.y;
          tracker.interpT = 1;
          tracker.fallStageTarget = null;
        }
      }

      // Rotation: penguin model faces +Z. rotation.y = θ maps +Z to (sin(θ), cos(θ))
      // Physics dir 0° = +X → targetRotY = -rad + π/2
      const dir =
        isCurrentPlayer && stageMovementActive && this.lobbyDirection !== null
          ? this.lobbyDirection
          : isCurrentPlayer && phase === "countdown"
          ? store.aimDirection
          : !isCurrentPlayer && phase === "countdown"
            ? penguin.public_direction ?? penguin.direction
            : penguin.direction;
      const rad = (dir * Math.PI) / 180;
      const targetRotY = -rad + Math.PI / 2;

      if (phase === "lobby") {
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
          ((phase === "countdown" && isCurrentPlayer) || phase === "animating") &&
          penguin.eliminated === 0;
        tracker.arrow.setEnabled(showArrow);
        if (showArrow) {
          const power =
            phase === "countdown"
              ? store.aimPower
              : store.roundMoves?.[id]?.power ?? (isCurrentPlayer ? store.aimPower : 6);
          const scale = 0.6 + (power / 10) * 1.5;
          tracker.arrow.scaling.z = scale;
          tracker.arrow.position.y =
            2.8 + Math.sin(performance.now() / 333) * 0.1;
        }
      }
    }

    // Camera follow during gameplay (skip during lobby — handled above)
    if (phase !== "lobby") {
      const player = localPlayer;
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
      } else if (player && player.zone === "stage") {
        const stageTarget = playerTracker
          ? new Vector3(
              playerTracker.root.position.x,
              playerTracker.root.position.y + 1.25,
              playerTracker.root.position.z,
            )
          : this.resolvePenguinWorldPosition(player, gs).add(
              new Vector3(0, 1.25, 0),
            );
        const blend = 1 - Math.exp(-3 * dt);
        this.camera.target.x += (stageTarget.x - this.camera.target.x) * blend;
        this.camera.target.y += (stageTarget.y - this.camera.target.y) * blend;
        this.camera.target.z += (stageTarget.z - this.camera.target.z) * blend;

        const desiredAlpha =
          Math.atan2(-stageTarget.z, -stageTarget.x) - Math.PI;
        let alphaDiff = desiredAlpha - this.camera.alpha;
        while (alphaDiff > Math.PI) alphaDiff -= 2 * Math.PI;
        while (alphaDiff < -Math.PI) alphaDiff += 2 * Math.PI;
        this.camera.alpha += alphaDiff * (1 - Math.exp(-2.5 * dt));
        this.camera.beta += (0.98 - this.camera.beta) * blend * 0.75;
        this.camera.radius += (18 - this.camera.radius) * blend * 0.65;
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

    const templateMeshes = await this.loadSkin(penguin.skin);
    if (templateMeshes.length === 0) return;

    const isCurrentPlayer = id === this.playerId;
    const root = new TransformNode(`penguin_${id}`, this.scene);

    const worldPosition = this.resolvePenguinWorldPosition(penguin, gs);
    root.position = worldPosition.clone();

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

    // Nameplate billboard
    const displayText = penguinDisplayName(penguin);
    const nameplate = createNameplate(this.scene, `nameplate_${id}`, displayText, isCurrentPlayer);
    nameplate.parent = root;

    const rad = (penguin.direction * Math.PI) / 180;
    this.penguins.set(id, {
      root,
      meshes: clonedMeshes,
      arrow,
      nameplate,
      interpFrom: worldPosition.clone(),
      interpTo: worldPosition.clone(),
      interpT: 1,
      lastX: worldPosition.x,
      lastZ: worldPosition.z,
      lastY: worldPosition.y,
      currentRotY: -rad + Math.PI / 2,
      isEliminated: false,
      fallStartAt: null,
      fallOrigin: null,
      fallStageTarget: null,
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
