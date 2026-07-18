export type RideDataPoint = {
  elapsedMs: number;
  distanceM: number;
  powerW: number;
  cadenceRpm: number;
  speedKph: number;
  gradePercent: number;
};

export type EffortZone = 1 | 2 | 3 | 4 | 5;

export function effortZone(powerW: number, ftpW: number): EffortZone {
  const ratio = powerW / Math.max(1, ftpW);
  if (ratio < 0.55) return 1;
  if (ratio < 0.75) return 2;
  if (ratio < 0.9) return 3;
  if (ratio < 1.05) return 4;
  return 5;
}

export function zoneDurations(
  samples: RideDataPoint[],
  ftpW: number,
): Record<EffortZone, number> {
  const durations: Record<EffortZone, number> = {
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0,
  };
  for (let index = 0; index < samples.length - 1; index += 1) {
    const duration = Math.max(
      0,
      Math.min(
        5_000,
        samples[index + 1]!.elapsedMs - samples[index]!.elapsedMs,
      ),
    );
    durations[effortZone(samples[index]!.powerW, ftpW)] += duration;
  }
  return durations;
}

export function bestAveragePower(
  samples: RideDataPoint[],
  windowMs: number,
): number {
  if (samples.length < 2 || samples.at(-1)!.elapsedMs < windowMs) return 0;
  let best = 0;
  let start = 0;
  for (let end = 0; end < samples.length; end += 1) {
    while (
      start < end &&
      samples[end]!.elapsedMs - samples[start]!.elapsedMs > windowMs
    )
      start += 1;
    if (samples[end]!.elapsedMs - samples[start]!.elapsedMs < windowMs * 0.85)
      continue;
    const range = samples.slice(start, end + 1);
    const average =
      range.reduce((sum, sample) => sum + sample.powerW, 0) / range.length;
    best = Math.max(best, average);
  }
  return best;
}

export function rideSamplesToCsv(samples: RideDataPoint[]): string {
  const rows = [
    "elapsed_s,distance_m,power_w,cadence_rpm,speed_kph,grade_percent",
    ...samples.map((sample) =>
      [
        (sample.elapsedMs / 1000).toFixed(1),
        sample.distanceM.toFixed(1),
        Math.round(sample.powerW),
        Math.round(sample.cadenceRpm),
        sample.speedKph.toFixed(1),
        sample.gradePercent.toFixed(1),
      ].join(","),
    ),
  ];
  return rows.join("\n");
}
