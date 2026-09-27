import type { WebGLRenderer } from "three";
import type { CameraSettings } from "./world-scene";

/** An authored scene borrows the existing renderer and its quality/resize lifecycle. */
export interface RideScene {
  render(
    renderer: WebGLRenderer,
    camera: CameraSettings,
    quality: string,
  ): void;
  getDiagnostics(): Record<string, number | string>;
  dispose(): void;
}
