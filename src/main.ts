import "./style.css";
import { InfinibikeApp } from "./app";

const canvas = document.querySelector<HTMLCanvasElement>("#world")!;
const root = document.querySelector<HTMLDivElement>("#app")!;

try {
  new InfinibikeApp(root, canvas);
} catch (error) {
  root.innerHTML = `
    <main class="fatal">
      <p class="eyebrow">Graphics unavailable</p>
      <h1>Infinibike needs WebGL2</h1>
      <p>${error instanceof Error ? error.message : "This browser could not start the 3D renderer."}</p>
    </main>
  `;
}
