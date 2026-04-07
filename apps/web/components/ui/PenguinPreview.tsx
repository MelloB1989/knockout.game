"use client";

import { useRef, useEffect, memo } from "react";
import { skinToGlb } from "@/lib/constants";

import { Engine } from "@babylonjs/core/Engines/engine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { Vector3, Color3, Color4 } from "@babylonjs/core/Maths/math.js";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera.js";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight.js";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight.js";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import "@babylonjs/core/Loading/loadingScreen.js";
import "@babylonjs/loaders/glTF/2.0/index.js";

interface PenguinPreviewProps {
  skin: string;
  width?: number;
  height?: number;
  className?: string;
}

function PenguinPreviewInner({ skin, width = 280, height = 340, className = "" }: PenguinPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const meshesRef = useRef<AbstractMesh[]>([]);
  const loadedSkinRef = useRef("");

  // Initialize engine/scene once
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || engineRef.current) return;

    const engine = new Engine(canvas, true, {
      preserveDrawingBuffer: false,
      stencil: false,
      premultipliedAlpha: false,
    });
    const scene = new Scene(engine);
    scene.clearColor = new Color4(0, 0, 0, 0);
    scene.ambientColor = new Color3(0.5, 0.45, 0.4);

    const camera = new ArcRotateCamera(
      "previewCam",
      -Math.PI / 2,
      Math.PI / 3.2,
      4.5,
      new Vector3(0, 0.9, 0),
      scene
    );
    camera.lowerRadiusLimit = 4.5;
    camera.upperRadiusLimit = 4.5;
    // Disable user interaction — auto-rotate only
    camera.inputs.clear();

    // Warm lighting
    const hemi = new HemisphericLight("hemi", new Vector3(0, 1, 0), scene);
    hemi.intensity = 1.1;
    hemi.diffuse = new Color3(1.0, 0.95, 0.88);
    hemi.groundColor = new Color3(0.35, 0.28, 0.2);

    const dir = new DirectionalLight("dir", new Vector3(-1, -2, 1).normalize(), scene);
    dir.intensity = 0.7;
    dir.diffuse = new Color3(1.0, 0.92, 0.82);

    engineRef.current = engine;
    sceneRef.current = scene;

    let alpha = -Math.PI / 2;
    engine.runRenderLoop(() => {
      alpha += 0.008;
      camera.alpha = alpha;
      scene.render();
    });

    return () => {
      engine.stopRenderLoop();
      scene.dispose();
      engine.dispose();
      engineRef.current = null;
      sceneRef.current = null;
      meshesRef.current = [];
      loadedSkinRef.current = "";
    };
  }, []);

  // Load/swap skin
  useEffect(() => {
    if (!sceneRef.current || loadedSkinRef.current === skin) return;
    loadedSkinRef.current = skin;

    // Dispose old
    for (const m of meshesRef.current) m.dispose();
    meshesRef.current = [];

    const scene = sceneRef.current;
    const glbPath = skinToGlb(skin);

    SceneLoader.ImportMeshAsync("", "", glbPath, scene).then((result) => {
      if (loadedSkinRef.current !== skin) {
        // Skin changed while loading — discard
        for (const m of result.meshes) m.dispose();
        return;
      }
      meshesRef.current = result.meshes;
    }).catch((e) => {
      console.warn("Failed to load penguin preview", glbPath, e);
    });
  }, [skin]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className={className}
      style={{ width, height, display: "block", touchAction: "none" }}
    />
  );
}

export default memo(PenguinPreviewInner);
