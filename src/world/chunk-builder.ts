import * as THREE from "three";
import type { TerrainDetail } from "./render-quality";
import { CityBuilder } from "./city-builder";
import { CountrysideBuilder } from "./countryside-builder";
import type { RenderContext } from "./render-context";
import { RoadBuilder } from "./road-builder";
import { renderScenery } from "./scenery-renderer";
import { buildCountrysideInfrastructure } from "./countryside-infrastructure";
import type { WorldChunkDescriptor } from "./world-generator";

export class ChunkBuilder {
  readonly road: RoadBuilder;
  private readonly city: CityBuilder;
  private readonly country: CountrysideBuilder;
  constructor(readonly context: RenderContext) {
    this.road = new RoadBuilder(context);
    this.city = new CityBuilder(context);
    this.country = new CountrysideBuilder(context);
  }
  build(
    chunk: WorldChunkDescriptor,
    detail: TerrainDetail = "near",
  ): THREE.Group {
    const group = new THREE.Group();
    group.name = `chunk-${chunk.index}`;
    group.add(
      this.context.surface.build(chunk),
      this.road.buildRoad(chunk),
      this.road.buildRoadMarkings(chunk),
    );
    if (this.context.settings.landscape === "city")
      group.add(
        this.city.buildCity(chunk, detail),
        this.road.buildBikeLanes(chunk),
      );
    else {
      const water = this.country.buildWater(chunk);
      if (water) group.add(water);
      group.add(this.road.buildCountrysideRouteEvents(chunk));
      group.add(
        renderScenery(
          this.context,
          this.context.planner.plan(chunk.index),
          detail,
        ),
        buildCountrysideInfrastructure(this.context, chunk),
      );
      if (chunk.landmark) group.add(this.country.buildLandmark(chunk));
    }
    return group;
  }
}
