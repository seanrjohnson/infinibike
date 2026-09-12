import { expect, it } from "vitest";
import { Vector3 } from "three";
import { cityBlockStyle, hasCurbParking } from "../../src/world/street-style";
import { stableShadowTarget } from "../../src/world/shadow-stability";

it("keeps street treatments stable across chunk seams and varies whole blocks", () => {
  expect(cityBlockStyle("blocks", 499)).toEqual(cityBlockStyle("blocks", 501));
  const styles = Array.from({ length: 100 }, (_, i) =>
    cityBlockStyle("blocks", i * 100 + 75),
  );
  expect(new Set(styles.map((s) => s.green)).size).toBe(2);
  expect(new Set(styles.map((s) => s.parking)).size).toBe(4);
  for (let i = 0; i < 100; i++) {
    const d = i * 100 + 75;
    const style = cityBlockStyle("blocks", d);
    expect(hasCurbParking("blocks", d, -1)).toBe(
      style.parking === 1 || style.parking === 3,
    );
    expect(hasCurbParking("blocks", d, 1)).toBe(
      style.parking === 2 || style.parking === 3,
    );
  }
});

it("keeps shadow projection stationary under subtexel motion on sloping terrain", () => {
  const direction = new Vector3(0.5, 0.7, 0.4).normalize();
  const right = new Vector3()
    .crossVectors(new Vector3(0, 1, 0), direction)
    .normalize();
  const up = new Vector3().crossVectors(direction, right).normalize();
  const texel = 100 / 2048;
  const start = stableShadowTarget(
    new Vector3(2350, 123, -7010),
    direction,
    texel,
  );
  for (const sign of [-1, 1]) {
    const moved = start
      .clone()
      .addScaledVector(right, texel * 0.2 * sign)
      .addScaledVector(up, texel * 0.2 * sign);
    const snapped = stableShadowTarget(moved, direction, texel);
    expect(snapped.dot(right)).toBeCloseTo(start.dot(right), 8);
    expect(snapped.dot(up)).toBeCloseTo(start.dot(up), 8);
  }
});
