import * as THREE from "three";

export function disposeObject(root: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (mesh instanceof THREE.InstancedMesh) mesh.dispose();
    if (!mesh.userData.sharedAsset && !mesh.userData.sharedGeometry)
      geometries.add(mesh.geometry);
    if (mesh.userData.sharedAsset || mesh.userData.sharedMaterial) return;
    for (const material of Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material])
      materials.add(material);
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}
export function markNoShadows(root: THREE.Object3D): void {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.userData.disableShadows = true;
    object.castShadow = false;
    object.receiveShadow = false;
  });
}

/** Batch complete local hierarchies only after their world matrices are resolved. */
export function batchStatic(root: THREE.Group): THREE.Group {
  root.updateMatrixWorld(true);
  const batches = new Map<
    string,
    { mesh: THREE.Mesh; matrices: THREE.Matrix4[]; colors: THREE.Color[] }
  >();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    const key = `${object.geometry.uuid}:${materials.map((m) => m.uuid).join(":")}:${Boolean(object.userData.disableShadows)}:${object.userData.sceneryCategory ?? ""}`;
    const batch = batches.get(key) ?? {
      mesh: object,
      matrices: [] as THREE.Matrix4[],
      colors: [] as THREE.Color[],
    };
    if (object instanceof THREE.InstancedMesh) {
      for (let index = 0; index < object.count; index++) {
        const matrix = new THREE.Matrix4();
        object.getMatrixAt(index, matrix);
        if (Math.abs(matrix.determinant()) < 1e-10) continue;
        batch.matrices.push(object.matrixWorld.clone().multiply(matrix));
        const color = new THREE.Color(0xffffff);
        if (object.instanceColor) object.getColorAt(index, color);
        batch.colors.push(color);
      }
      object.dispose();
    } else {
      batch.matrices.push(object.matrixWorld.clone());
      batch.colors.push(new THREE.Color(0xffffff));
    }
    batches.set(key, batch);
  });
  const result = new THREE.Group();
  result.name = root.name;
  for (const { mesh, matrices, colors } of batches.values()) {
    if (matrices.length === 0) {
      disposeObject(mesh);
      continue;
    }
    const instances = new THREE.InstancedMesh(
      mesh.geometry,
      mesh.material,
      matrices.length,
    );
    matrices.forEach((matrix, index) => {
      instances.setMatrixAt(index, matrix);
      instances.setColorAt(index, colors[index]!);
    });
    instances.instanceMatrix.needsUpdate = true;
    instances.userData = { ...mesh.userData };
    instances.name = mesh.name;
    result.add(instances);
  }
  result.userData = root.userData;
  return result;
}

/** Screen-door fading avoids transparent-instance sorting and depth artifacts. */
export function fadeDecoration(root: THREE.Group): void {
  root.traverse((object) => {
    if (
      !(object instanceof THREE.Mesh) ||
      object.userData.sceneryCategory !== "prop"
    )
      return;
    const source = Array.isArray(object.material)
      ? object.material
      : [object.material];
    const materials = source.map((original) => {
      const material = object.userData.sharedAsset
        ? original.clone()
        : original;
      material.onBeforeCompile = (
        shader: THREE.WebGLProgramParametersWithUniforms,
      ) => {
        shader.vertexShader =
          "varying float sceneryDistance;\n" + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace(
          "#include <project_vertex>",
          "#include <project_vertex>\nsceneryDistance = length(mvPosition.xyz);",
        );
        shader.fragmentShader =
          "varying float sceneryDistance;\n" + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <clipping_planes_fragment>",
          "#include <clipping_planes_fragment>\nfloat visibility = 1.0 - smoothstep(380.0, 520.0, sceneryDistance);\nfloat threshold = fract(dot(floor(gl_FragCoord.xy), vec2(0.75487766, 0.56984029)));\nif (visibility < threshold) discard;",
        );
      };
      material.customProgramCacheKey = () => "scenery-distance-fade-v1";
      return material;
    });
    if (object.userData.sharedAsset) {
      object.userData.sharedGeometry = true;
      object.userData.sharedAsset = false;
    }
    object.material = Array.isArray(object.material)
      ? materials
      : materials[0]!;
  });
}
