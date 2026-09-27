import { expect, test } from "@playwright/test";

for (const suffix of ["desktop", "@mobile"]) {
  test(`streaming cover cannot hide completed terrain or roads ${suffix}`, async ({
    page,
  }) => {
    await page.goto("/?e2e=1");
    const result = await page.evaluate(async () => {
      const paths = [
        "/node_modules/three/build/three.module.js",
        "/src/world/terrain-stream.ts",
        "/src/world/terrain-surface.ts",
        "/src/world/world-generator.ts",
        "/src/domain/environment.ts",
      ];
      const [
        THREE,
        { TerrainStream },
        { TerrainSurface },
        { WorldGenerator },
        { normalizeEnvironment },
      ] = await Promise.all(
        paths.map((path) => import(/* @vite-ignore */ path)),
      );
      const stream = new TerrainStream(
        new TerrainSurface(
          new WorldGenerator(normalizeEnvironment({ seed: "lake-tour" })),
        ),
      );
      stream.update({ x: 0, z: 0 }, 0, 150, "medium", []);
      const cover = stream.group.getObjectByName("terrain-streaming-cover");
      // A coarse triangle may bridge a valley above the detailed road. Put the
      // cover above the completed surface to exercise that exact depth conflict.
      const positions = cover.geometry.getAttribute("position");
      for (let i = 0; i < positions.count; i++) positions.setY(i, 1);
      positions.needsUpdate = true;
      cover.geometry.computeBoundingSphere();
      const scene = new THREE.Scene();
      scene.add(stream.group, new THREE.AmbientLight(0xffffff, 2));
      const road = new THREE.Mesh(
        new THREE.PlaneGeometry(10, 10),
        new THREE.MeshBasicMaterial({ color: 0xff0000 }),
      );
      road.rotation.x = -Math.PI / 2;
      scene.add(road);
      const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 100);
      camera.position.set(0, 20, 0);
      camera.lookAt(0, 0, 0);
      const renderer = new THREE.WebGLRenderer();
      renderer.setSize(32, 32);
      const gl = renderer.getContext();
      const pixel = new Uint8Array(4);
      const read = () => {
        renderer.render(scene, camera);
        gl.readPixels(16, 16, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        return [...pixel];
      };
      const completedRoad = read();
      road.visible = false;
      const unloadedGround = read();
      road.geometry.dispose();
      road.material.dispose();
      stream.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      return { completedRoad, unloadedGround };
    });
    expect(result.completedRoad).toEqual([255, 0, 0, 255]);
    // Fallback follows the local biome, which is not necessarily green.
    expect(result.unloadedGround).not.toEqual(result.completedRoad);
    expect(result.unloadedGround[1]).toBeGreaterThan(50);
  });
}
