import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { getServerEnv } from "@/lib/config/env";
import { createLocalDownloadToken } from "./local-token";
import { assertSafeStorageKey } from "./key";
import type { FileStorageAdapter } from "./interface";

function objectPath(key: string): string {
  assertSafeStorageKey(key);
  const root = path.resolve(getServerEnv().FILE_LOCAL_STORAGE_PATH);
  const destination = path.resolve(root, ...key.split("/"));
  if (!destination.startsWith(`${root}${path.sep}`)) {
    throw new Error("File storage key escaped the local storage root");
  }
  return destination;
}

export class LocalFileStorageAdapter implements FileStorageAdapter {
  async put(input: { key: string; body: Buffer }): Promise<void> {
    const destination = objectPath(input.key);
    const directory = path.dirname(destination);
    await mkdir(directory, { recursive: true });
    const temporary = path.join(directory, `.${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, input.body, { flag: "wx" });
      await rename(temporary, destination);
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
  }

  async get(key: string): Promise<Buffer> {
    try {
      return await readFile(objectPath(key));
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        throw new Error("Stored file is missing");
      }
      throw error;
    }
  }

  async signDownload(input: {
    key: string;
    ttlSeconds: number;
    filename: string;
    contentType: string;
  }): Promise<string> {
    assertSafeStorageKey(input.key);
    const env = getServerEnv();
    const expiresAt = Math.floor(Date.now() / 1000) + input.ttlSeconds;
    const token = createLocalDownloadToken(input.key, expiresAt, env.BETTER_AUTH_SECRET);
    const url = new URL("/api/files/local-download", env.BETTER_AUTH_URL);
    url.searchParams.set("token", token);
    url.searchParams.set("name", input.filename);
    return url.toString();
  }

  async delete(key: string): Promise<void> {
    await rm(objectPath(key), { force: true });
  }

  async exists(key: string): Promise<boolean> {
    try {
      await readFile(objectPath(key));
      return true;
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
      throw error;
    }
  }
}
