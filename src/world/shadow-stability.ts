import { Vector3 } from "three";

/** Snap in the light's image plane, including elevation and world rebasing. */
export function stableShadowTarget(
  target: Vector3,
  direction: Vector3,
  texelM: number,
) {
  const right = new Vector3()
    .crossVectors(new Vector3(0, 1, 0), direction)
    .normalize();
  const up = new Vector3().crossVectors(direction, right).normalize();
  const result = target.clone();
  for (const axis of [right, up]) {
    const coordinate = target.dot(axis);
    result.addScaledVector(
      axis,
      Math.round(coordinate / texelM) * texelM - coordinate,
    );
  }
  return result;
}
