import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

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
  private loaded = false;
  readonly ready: Promise<void>;

  constructor() {
    const url = `${import.meta.env.BASE_URL}assets/models/infinibike-assets.glb`;
    this.ready = new GLTFLoader()
      .loadAsync(url)
      .then(({ scene }) => {
        scene.traverse((object) => {
          if (!object.name.startsWith(ASSET_PREFIX)) return;
          const key = object.name.slice(ASSET_PREFIX.length) as AssetKey;
          this.templates.set(key, object);
        });
        this.loaded = this.templates.size > 0;
      })
      .catch(() => {
        this.loaded = false;
      });
  }

  get isReady(): boolean {
    return this.loaded;
  }

  get size(): number {
    return this.templates.size;
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
    group.add(clone);
    return group;
  }
}
