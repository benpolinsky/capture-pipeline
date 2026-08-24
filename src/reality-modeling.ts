import {
  BentleyClient,
  objectValue,
  type RealityModelingJob,
  type RealityModelingJobProgress,
  type RealityModelingJobState,
} from "./bentley.js";

const POLL_BACKOFF_MS = [15_000, 30_000, 60_000, 120_000] as const;
const TERMINAL_STATES = new Set<RealityModelingJobState>([
  "Cancelled",
  "Failed",
  "Success",
]);

export type RealityModelingExportFormat =
  | "3DTiles"
  | "3MX"
  | "OBJ"
  | "LAS"
  | "PLY"
  | "OPC"
  | "OrthophotoDSM"
  | "I3S"
  | "OSGB";

export interface PipelineResult {
  fillImagePropertiesJob: RealityModelingJob;
  calibrationJob: RealityModelingJob;
  reconstructionJob: RealityModelingJob;
  sourceSceneId: string;
  calibratedSceneId: string;
}

export interface PipelineEvent {
  stage: "FillImageProperties" | "Calibration" | "Reconstruction";
  jobId: string;
  state: RealityModelingJobState;
  percentage?: number;
}

export async function processImageCollection(
  client: BentleyClient,
  options: {
    iTwinId: string;
    imageCollectionId: string;
    name: string;
    format?: RealityModelingExportFormat;
    onEvent?: (event: PipelineEvent) => void;
  },
): Promise<PipelineResult> {
  const format = options.format ?? "3DTiles";

  const fill = await client.createRealityModelingJob({
    type: "FillImageProperties",
    name: `${options.name} - image properties`,
    iTwinId: options.iTwinId,
    specifications: {
      inputs: { imageCollections: [options.imageCollectionId] },
      outputs: ["Scene"],
    },
  });
  options.onEvent?.({
    stage: "FillImageProperties",
    jobId: fill.id,
    state: fill.state,
  });
  const completedFill = await waitForJob(client, fill.id, "FillImageProperties", options.onEvent);
  const sourceSceneId = requireSceneOutput(completedFill);

  const calibration = await client.createRealityModelingJob({
    type: "Calibration",
    name: `${options.name} - calibration`,
    iTwinId: options.iTwinId,
    specifications: {
      inputs: { scene: sourceSceneId },
      outputs: ["Scene", "Report", "TexturedTiePoints"],
    },
  });
  options.onEvent?.({
    stage: "Calibration",
    jobId: calibration.id,
    state: calibration.state,
  });
  const completedCalibration = await waitForJob(
    client,
    calibration.id,
    "Calibration",
    options.onEvent,
  );
  const calibratedSceneId = requireSceneOutput(completedCalibration);

  const reconstruction = await client.createRealityModelingJob({
    type: "Reconstruction",
    name: `${options.name} - reconstruction`,
    iTwinId: options.iTwinId,
    specifications: {
      inputs: { scene: calibratedSceneId },
      outputs: {
        modelingReference: true,
        exports: [
          {
            format,
            name: `${options.name} - ${format}`,
          },
        ],
      },
    },
  });
  options.onEvent?.({
    stage: "Reconstruction",
    jobId: reconstruction.id,
    state: reconstruction.state,
  });
  const completedReconstruction = await waitForJob(
    client,
    reconstruction.id,
    "Reconstruction",
    options.onEvent,
  );

  return {
    fillImagePropertiesJob: completedFill,
    calibrationJob: completedCalibration,
    reconstructionJob: completedReconstruction,
    sourceSceneId,
    calibratedSceneId,
  };
}

export async function waitForJob(
  client: BentleyClient,
  jobId: string,
  stage: PipelineEvent["stage"],
  onEvent?: (event: PipelineEvent) => void,
): Promise<RealityModelingJob> {
  let delayIndex = 0;
  let lastPercentage: number | undefined;

  while (true) {
    const progress = await client.getRealityModelingJobProgress(jobId);
    const state = progress.state ?? "Active";
    onEvent?.({ stage, jobId, state, percentage: progress.percentage });

    if (TERMINAL_STATES.has(state)) {
      const job = await client.getRealityModelingJob(jobId);
      if (job.state !== "Success") {
        throw new Error(`${stage} job ${jobId} ended in state ${job.state}.`);
      }
      return job;
    }

    const percentageChanged =
      progress.percentage !== undefined && progress.percentage !== lastPercentage;
    if (percentageChanged) delayIndex = 0;
    else delayIndex = Math.min(delayIndex + 1, POLL_BACKOFF_MS.length - 1);
    lastPercentage = progress.percentage;

    await sleep(POLL_BACKOFF_MS[delayIndex]);
  }
}

export function requireSceneOutput(job: RealityModelingJob): string {
  const outputs = objectValue(job.specifications.outputs);
  const scene = outputs?.scene;
  if (typeof scene !== "string" || !scene) {
    throw new Error(`${job.type} job ${job.id} did not return a scene output.`);
  }
  return scene;
}

export function getReconstructionOutputs(job: RealityModelingJob): Record<string, unknown> {
  return objectValue(job.specifications.outputs) ?? {};
}

export function isExportFormat(value: string): value is RealityModelingExportFormat {
  return [
    "3DTiles",
    "3MX",
    "OBJ",
    "LAS",
    "PLY",
    "OPC",
    "OrthophotoDSM",
    "I3S",
    "OSGB",
  ].includes(value);
}

export function formatProgress(progress: RealityModelingJobProgress): string {
  const percentage =
    progress.percentage === undefined ? "" : ` ${Math.round(progress.percentage)}%`;
  return `${progress.state ?? "Unknown"}${percentage}`;
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
