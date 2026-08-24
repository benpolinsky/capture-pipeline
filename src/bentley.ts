import path from "node:path";
import { ContainerClient } from "@azure/storage-blob";
import { getBentleyConfig } from "./config.js";

const ACCEPT_V1 = "application/vnd.bentley.itwin-platform.v1+json";
const ACCEPT_V2 = "application/vnd.bentley.itwin-platform.v2+json";

export interface RealityData {
  id: string;
  displayName?: string;
  authoring?: boolean;
  [key: string]: unknown;
}

export type RealityModelingJobState =
  | "Queued"
  | "Active"
  | "TerminatingOnCancel"
  | "TerminatingOnFailure"
  | "Cancelled"
  | "Failed"
  | "Success";

export interface RealityModelingJob {
  id: string;
  state: RealityModelingJobState;
  type: string;
  iTwinId: string;
  name?: string;
  specifications: Record<string, unknown>;
  executionInfo?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface RealityModelingJobProgress {
  percentage?: number;
  state?: RealityModelingJobState;
}

export class BentleyClient {
  private readonly apiBaseUrl: string;

  public constructor(private readonly accessToken: string, apiBaseUrl?: string) {
    if (!accessToken.trim()) throw new Error("Bentley access token is empty.");
    this.apiBaseUrl = apiBaseUrl?.replace(/\/$/, "") || getBentleyConfig().apiBaseUrl;
  }

  public async createImageCollection(itwinId: string, displayName: string): Promise<RealityData> {
    const payload = await this.request("/reality-management/reality-data/", {
      method: "POST",
      body: JSON.stringify({
        iTwinId: itwinId,
        displayName,
        classification: "Undefined",
        type: "CCImageCollection",
        authoring: true,
      }),
    });

    return realityDataFrom(payload, "Create reality data response did not include an id.");
  }

  public async getWriteContainerUrl(realityDataId: string, itwinId: string): Promise<string> {
    const params = new URLSearchParams({ iTwinId: itwinId });
    const payload = await this.request(
      `/reality-management/reality-data/${encodeURIComponent(realityDataId)}/writeaccess?${params}`,
    );

    const container = objectValue(payload.container) ?? payload;
    const links = objectValue(container._links);
    const containerUrl = objectValue(links?.containerUrl);
    const href = containerUrl?.href;
    if (typeof href !== "string" || !href) {
      throw new Error("Write-access response did not include a container URL.");
    }
    return href;
  }

  public async finalizeRealityData(realityDataId: string, itwinId: string): Promise<RealityData> {
    const payload = await this.request(
      `/reality-management/reality-data/${encodeURIComponent(realityDataId)}`,
      {
        method: "PATCH",
        body: JSON.stringify({ iTwinId: itwinId, authoring: false }),
      },
    );

    return realityDataFrom(payload, "Finalize response was not a reality data object.");
  }

  public async createRealityModelingJob(
    job: Record<string, unknown>,
  ): Promise<RealityModelingJob> {
    const payload = await this.request(
      "/reality-modeling/jobs",
      { method: "POST", body: JSON.stringify(job) },
      ACCEPT_V2,
    );
    return jobFrom(payload);
  }

  public async getRealityModelingJob(jobId: string): Promise<RealityModelingJob> {
    const payload = await this.request(
      `/reality-modeling/jobs/${encodeURIComponent(jobId)}`,
      {},
      ACCEPT_V2,
    );
    return jobFrom(payload);
  }

  public async getRealityModelingJobProgress(
    jobId: string,
  ): Promise<RealityModelingJobProgress> {
    const payload = await this.request(
      `/reality-modeling/jobs/${encodeURIComponent(jobId)}/progress`,
      {},
      ACCEPT_V2,
    );
    const progress = objectValue(payload.progress);
    if (!progress) throw new Error("Reality Modeling progress response was malformed.");
    return progress as RealityModelingJobProgress;
  }

  private async request(
    endpoint: string,
    init: RequestInit = {},
    accept = ACCEPT_V1,
  ): Promise<Record<string, unknown>> {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${this.accessToken}`);
    headers.set("Accept", accept);
    if (init.body !== undefined) headers.set("Content-Type", "application/json");

    const response = await fetch(`${this.apiBaseUrl}${endpoint}`, {
      ...init,
      headers,
    });

    if (!response.ok) {
      const detail = (await response.text()).trim();
      throw new Error(
        `Bentley API returned ${response.status}: ${detail || response.statusText || "request failed"}`,
      );
    }

    const payload: unknown = await response.json();
    const object = objectValue(payload);
    if (!object) throw new Error("Bentley API returned an unexpected response.");
    return object;
  }
}

export async function uploadFiles(options: {
  containerUrl: string;
  files: string[];
  root: string;
  prefix?: string;
  onUploaded?: (file: string, blobName: string) => void;
}): Promise<number> {
  const container = new ContainerClient(options.containerUrl);
  const resolvedRoot = path.resolve(options.root);
  const prefix = options.prefix?.replace(/^\/+|\/+$/g, "") ?? "";
  let uploaded = 0;

  for (const file of options.files) {
    const resolvedFile = path.resolve(file);
    const relative =
      options.files.length === 1 && resolvedRoot === resolvedFile
        ? path.basename(resolvedFile)
        : path.relative(resolvedRoot, resolvedFile);

    if (!relative || relative.startsWith("..")) {
      throw new Error(`Photo is outside upload root: ${resolvedFile}`);
    }

    const normalized = relative.split(path.sep).join("/");
    const blobName = prefix ? `${prefix}/${normalized}` : normalized;
    const blob = container.getBlockBlobClient(blobName);
    await blob.uploadFile(resolvedFile, { conditions: { ifNoneMatch: "*" } });
    uploaded += 1;
    options.onUploaded?.(resolvedFile, blobName);
  }

  return uploaded;
}

function realityDataFrom(payload: Record<string, unknown>, error: string): RealityData {
  const realityData = objectValue(payload.realityData) ?? payload;
  if (typeof realityData.id !== "string" || !realityData.id) throw new Error(error);
  return realityData as RealityData;
}

function jobFrom(payload: Record<string, unknown>): RealityModelingJob {
  const job = objectValue(payload.job) ?? payload;
  if (
    typeof job.id !== "string" ||
    typeof job.state !== "string" ||
    typeof job.type !== "string" ||
    typeof job.iTwinId !== "string" ||
    !objectValue(job.specifications)
  ) {
    throw new Error("Reality Modeling response did not include a valid job.");
  }
  return job as unknown as RealityModelingJob;
}

export function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
