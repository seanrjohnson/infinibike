import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";

export type AssetKey =
  | "tree_oak"
  | "tree_maple"
  | "tree_pine"
  | "tree_birch"
  | "tree_flowering"
  | "fence_split_rail"
  | "fence_picket"
  | "fence_stone"
  | "cow"
  | "sheep"
  | "raccoon"
  | "dinosaur"
  | "dog"
  | "deer"
  | "horse"
  | "fox"
  | "car_sedan"
  | "car_van"
  | "car_hatchback"
  | "car_wagon"
  | "car_pickup"
  | "car_taxi"
  | "person_a"
  | "person_b"
  | "person_c"
  | "person_d"
  | "person_e"
  | "person_f"
  | "corner_shop"
  | "stepped_apartment"
  | "balcony_apartment"
  | "office_tower"
  | "workshop"
  | "hotel"
  | "house"
  | "cottage"
  | "duplex"
  | "apartment"
  | "townhouses"
  | "bodega"
  | "cafe"
  | "bakery"
  | "bookstore"
  | "warehouse"
  | "office"
  | "school"
  | "fire_station"
  | "church"
  | "barn"
  | "silo"
  | "farmhouse"
  | "produce_stand"
  | "covered_bridge"
  | "windmill"
  | "water_tower"
  | "bench"
  | "streetlamp"
  | "fire_hydrant"
  | "mailbox"
  | "trash_bin"
  | "bike_rack"
  | "bus_shelter"
  | "traffic_light"
  | "rock_cluster"
  | "hay_bales"
  | "flower_patch"
  | "reed_clump"
  | "berry_bush"
  | "fallen_log"
  | "tree_stump"
  | "farm_gate"
  | "picnic_table"
  | "trail_sign"
  | "crop_corn"
  | "crop_wheat"
  | "utility_pole"
  | "plane"
  | "helicopter";

export const ASSET_BASE_DIMENSIONS: Partial<
  Record<AssetKey, readonly [number, number, number]>
> = {
  house: [8.2, 6.6, 7],
  cottage: [8.2, 6.6, 7],
  duplex: [9, 7.2, 7.2],
  apartment: [11, 12, 8],
  townhouses: [12.9, 9, 7],
  bodega: [9.4, 7.6, 7],
  cafe: [9.4, 7.6, 7],
  bakery: [9.4, 7.6, 7],
  bookstore: [9.4, 7.6, 7],
  warehouse: [14, 9.3, 12],
  office: [11.5, 14.3, 9],
  school: [16, 7.8, 10],
  fire_station: [13.5, 12, 10],
  church: [8.8, 15.8, 12.8],
  farmhouse: [9.9, 8.2, 9.6],
  produce_stand: [5.9, 3.7, 3.3],
  covered_bridge: [8.3, 6.2, 12.8],
  windmill: [5, 9.3, 1.5],
  water_tower: [5.1, 9.3, 5.1],
  car_sedan: [1.9, 1.65, 4.2],
  car_van: [1.9, 2.1, 4.7],
  car_hatchback: [1.9, 1.75, 3.7],
  car_wagon: [1.9, 1.75, 4.6],
  car_pickup: [1.9, 1.9, 4.8],
  car_taxi: [1.9, 1.85, 4.2],
};

const ASSET_PREFIX = "asset__";

export class AssetLibrary {
  private readonly templates = new Map<AssetKey, THREE.Object3D>();
  private readonly bounds = new Map<AssetKey, THREE.Box3>();
  private readonly anchors = new Map<AssetKey, THREE.Vector3>();
  private loaded = false;
  private failed = false;
  readonly ready: Promise<void>;

  constructor() {
    const url = `${import.meta.env.BASE_URL}assets/models/infinibike-assets.glb`;
    this.ready = new GLTFLoader()
      .loadAsync(url)
      .then(({ scene }) => {
        scene.traverse((object) => {
          if (object instanceof THREE.Mesh) {
            if (
              /(LeafSage|LeafSunlit|LeafAutumn|FloweringPink)$/.test(
                object.name,
              )
            ) {
              const weldedGeometry = object.geometry.clone();
              weldedGeometry.deleteAttribute("normal");
              weldedGeometry.deleteAttribute("tangent");
              object.geometry = mergeVertices(weldedGeometry, 0.0001);
            }
            if (!object.geometry.getAttribute("normal"))
              object.geometry.computeVertexNormals();
            const materials = Array.isArray(object.material)
              ? object.material
              : [object.material];
            for (const material of materials) {
              if (
                material instanceof THREE.MeshStandardMaterial ||
                material instanceof THREE.MeshLambertMaterial ||
                material instanceof THREE.MeshPhongMaterial
              ) {
                material.flatShading = false;
              }
              if (material instanceof THREE.MeshStandardMaterial) {
                material.roughness = Math.max(material.roughness, 0.72);
              }
              material.needsUpdate = true;
            }
          }
          if (!object.name.startsWith(ASSET_PREFIX)) return;
          const key = (object.userData.asset_key ??
            object.name.slice(ASSET_PREFIX.length)) as AssetKey;
          object.updateWorldMatrix(true, true);
          const wrapper = new THREE.Group();
          wrapper.add(object.clone(true));
          wrapper.updateMatrixWorld(true);
          const bounds = new THREE.Box3().setFromObject(wrapper);
          const size = bounds.getSize(new THREE.Vector3());
          if (
            bounds.isEmpty() ||
            ![size.x, size.y, size.z].every(
              (value) => Number.isFinite(value) && value > 0,
            )
          )
            return;
          this.templates.set(key, object);
          this.bounds.set(key, bounds);
          // A transformed mesh AABB can extend well below its real vertices.
          // Keep conservative dimensions for planning, but anchor the real mesh.
          const precise = new THREE.Box3().setFromObject(wrapper, true);
          const center = precise.getCenter(new THREE.Vector3());
          this.anchors.set(
            key,
            new THREE.Vector3(-center.x, -precise.min.y, -center.z),
          );
        });
        this.loaded = this.templates.size > 0;
      })
      .catch(() => {
        this.loaded = false;
        this.failed = true;
      });
  }

  get isReady(): boolean {
    return this.loaded;
  }

  get size(): number {
    return this.templates.size;
  }

  get status(): "ready" | "loading" | "failed" {
    return this.loaded ? "ready" : this.failed ? "failed" : "loading";
  }

  dimensions(key: AssetKey): THREE.Vector3 | undefined {
    return this.bounds.get(key)?.getSize(new THREE.Vector3());
  }

  instantiate(key: AssetKey): THREE.Group | undefined {
    const template = this.templates.get(key);
    if (!template) return undefined;
    const group = new THREE.Group();
    group.name = `asset-${key}`;
    const clone = template.clone(true);
    // Keep the exporter-authored root transform. Blender's Z-up to glTF Y-up
    // conversion is stored here; clearing it lays upright assets on their backs.
    clone.traverse((object) => {
      object.userData.sharedAsset = true;
    });
    group.userData.sharedAsset = true;
    const anchor = new THREE.Group();
    anchor.position.copy(this.anchors.get(key)!);
    anchor.add(clone);
    group.add(anchor);
    return group;
  }
}
