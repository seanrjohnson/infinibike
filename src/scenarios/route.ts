import { CatmullRomCurve3, Vector3 } from "three";
import type { ScenarioRoute } from "./types";

/** Closed curves use an arc-length lookup, never parametric t as distance. */
export class AuthoredRoute {
  readonly curve: CatmullRomCurve3;
  readonly lengthM: number;
  constructor(readonly definition: ScenarioRoute) {
    this.curve = new CatmullRomCurve3(
      definition.points.map(([x, z]) => new Vector3(x, 0, z)),
      true,
      "centripetal",
    );
    this.curve.arcLengthDivisions = 2048;
    this.curve.updateArcLengths();
    this.lengthM = this.curve.getLength();
  }
  sample(distanceM: number): {
    position: Vector3;
    tangent: Vector3;
    gradePercent: number;
  } {
    const u =
      (((distanceM % this.lengthM) + this.lengthM) % this.lengthM) /
      this.lengthM;
    return {
      position: this.curve.getPointAt(u),
      tangent: this.curve.getTangentAt(u),
      gradePercent: 0,
    };
  }
}
