import "server-only";
import { once } from "node:events";
import net from "node:net";
import { getServerEnv } from "@/lib/config/env";
import type { MalwareScanAdapter, MalwareScanResult } from "./interface";

const CHUNK_SIZE = 64 * 1024;
const SCAN_TIMEOUT_MS = 60_000;

async function writeBuffer(socket: net.Socket, buffer: Buffer) {
  if (!socket.write(buffer)) await once(socket, "drain");
}

export class ClamAvAdapter implements MalwareScanAdapter {
  async scan(body: Buffer): Promise<MalwareScanResult> {
    const env = getServerEnv();
    if (!env.CLAMAV_HOST) throw new Error("ClamAV is not configured");

    return new Promise((resolve, reject) => {
      const socket = net.createConnection({ host: env.CLAMAV_HOST, port: env.CLAMAV_PORT });
      let response = "";
      let settled = false;
      const fail = () => {
        if (settled) return;
        settled = true;
        socket.destroy();
        reject(new Error("ClamAV scan failed"));
      };

      socket.setTimeout(SCAN_TIMEOUT_MS, fail);
      socket.on("data", (chunk: Buffer) => {
        response += chunk.toString("utf8");
        if (!response.includes("\0")) return;
        settled = true;
        socket.destroy();
        if (response.includes("stream: OK")) {
          resolve({ clean: true });
        } else if (response.includes("FOUND")) {
          resolve({ clean: false });
        } else {
          reject(new Error("ClamAV scan failed"));
        }
      });
      socket.on("error", fail);
      socket.on("connect", async () => {
        try {
          await writeBuffer(socket, Buffer.from("zINSTREAM\0"));
          for (let offset = 0; offset < body.length; offset += CHUNK_SIZE) {
            const chunk = body.subarray(offset, Math.min(offset + CHUNK_SIZE, body.length));
            const length = Buffer.allocUnsafe(4);
            length.writeUInt32BE(chunk.length);
            await writeBuffer(socket, length);
            await writeBuffer(socket, chunk);
          }
          const end = Buffer.alloc(4);
          end.writeUInt32BE(0);
          socket.end(end);
        } catch {
          fail();
        }
      });
    });
  }
}
