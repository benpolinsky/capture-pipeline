import assert from "node:assert/strict";
import test from "node:test";
import type { RealityModelingJob } from "../src/bentley.js";
import { isExportFormat, requireSceneOutput } from "../src/reality-modeling.js";

function jobWithOutputs(outputs: Record<string, unknown>): RealityModelingJob {
  return {
    id: "job-1",
    state: "Success",
    type: "Calibration",
    iTwinId: "itwin-1",
    specifications: { outputs },
  };
}

test("extracts a ContextScene output", () => {
  assert.equal(requireSceneOutput(jobWithOutputs({ scene: "scene-1" })), "scene-1");
});

test("rejects jobs without a scene output", () => {
  assert.throws(() => requireSceneOutput(jobWithOutputs({})), /did not return a scene output/);
});

test("validates Reality Modeling export formats", () => {
  assert.equal(isExportFormat("3DTiles"), true);
  assert.equal(isExportFormat("OBJ"), true);
  assert.equal(isExportFormat("GLTF"), false);
});
