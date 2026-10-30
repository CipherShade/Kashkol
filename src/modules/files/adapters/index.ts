import "server-only";
import { getServerEnv } from "@/lib/config/env";
import type { FileStorageAdapter, MalwareScanAdapter } from "./interface";
import { LocalFileStorageAdapter } from "./local";
import { S3FileStorageAdapter } from "./s3";
import { ClamAvAdapter } from "./clamav";

export function getFileStorageAdapter(): FileStorageAdapter {
  return getServerEnv().FILE_STORAGE_DRIVER === "s3"
    ? new S3FileStorageAdapter()
    : new LocalFileStorageAdapter();
}

export function getMalwareScanAdapter(): MalwareScanAdapter {
  return new ClamAvAdapter();
}
