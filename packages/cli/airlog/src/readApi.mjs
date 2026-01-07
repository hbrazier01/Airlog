import { Worker } from "node:worker_threads";
import path from "node:path";
import express from "express";
import cors from "cors";

import { connectAirlogApi } from "./connectApi.mjs";

let apiPromise = null;

async function getApi() {
  if (!apiPromise) {
    apiPromise = connectAirlogApi().then(({ api }) => api);
  }
  return apiPromise;
}

function hexToBytes32(hex) {
  const s = String(hex || "").trim();
  const h = s.startsWith("0x") ? s.slice(2) : s;

  if (h.length !== 64) {
    throw new Error("Expected 32-byte hex (64 chars)");
  }
  return Uint8Array.from(Buffer.from(h, "hex"));
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

function toHex(x) {
  if (!x) return null;
  if (typeof x === "string") return x;
  if (x?.bytes) x = x.bytes; // handles { bytes: Uint8Array }
  if (x instanceof Uint8Array) return Buffer.from(x).toString("hex");
  if (Array.isArray(x)) return Buffer.from(x).toString("hex");
  return String(x);
}

const app = express();

function getEntryViaWorker(airframeIdHex, entryId, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const workerPath = path.resolve(
      process.cwd(),
      "packages",
      "cli",
      "airlog",
      "src",
      "getEntryWorker.mjs"
    );

    const w = new Worker(workerPath, { workerData: { airframeIdHex, entryId } });

    const t = setTimeout(() => {
      w.terminate();
      reject(new Error(`getEntry(${entryId}) timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    w.on("message", (msg) => {
      clearTimeout(t);
      w.terminate();
      if (msg && msg.__error) reject(new Error(msg.__error));
      else resolve(msg);
    });

    w.on("error", (err) => {
      clearTimeout(t);
      w.terminate();
      reject(err);
    });

    w.on("exit", (code) => {
      if (code !== 0) {
        clearTimeout(t);
        reject(new Error(`Worker exited with code ${code}`));
      }
    });
  });
}

app.use(
  cors({
    origin: ["https://digitalaviationpool.com", "https://www.digitalaviationpool.com"],
    methods: ["GET", "OPTIONS"],
  })
);

app.get("/health", (_req, res) => res.json({ ok: true }));

app.get("/airlog/airframes/:airframeId/entries", async (req, res) => {
  try {
    const airframeIdHex = req.params.airframeId.trim();
    console.log("entries: start", airframeIdHex);
    console.log("entries: airframeIdHex length =", airframeIdHex.length);

    if (!/^[0-9a-fA-F]{64}$/.test(airframeIdHex)) {
      return res.status(400).json({
        error: "Invalid airframeId",
        message: `Expected 64 hex chars, got length=${airframeIdHex.length}`,
        received: airframeIdHex,
      });
    }

    // Connect once (cached in getApi), but we won't call getNextEntryId anymore.
    await getApi();
    console.log("entries: got api");

    const entries = [];
    const MAX_PROBE = 25;

    for (let entryId = 1; entryId <= MAX_PROBE; entryId++) {
      console.log("entries: probing entry (worker)", entryId);

      try {
        const entry = await getEntryViaWorker(airframeIdHex, entryId, 120000);
        entries.push(entry);
      } catch (e) {
        console.log(
          "entries: stop probing at entry",
          entryId,
          "reason:",
          e?.message ?? String(e)
        );
        break;
      }
    }

    return res.json({ airframeId: airframeIdHex, totalEntries: entries.length, entries });

  } catch (err) {
    console.error("entries route error:", err);
    console.error("stack:", err?.stack);

    return res.status(500).json({
      error: "Failed to load entries",
      message: err?.message ?? String(err),
    });
  }
});


   const PORT = Number(process.env.PORT ?? 8787);
   app.listen(PORT, "0.0.0.0", () => console.log(`✅ AirLog Read API listening on :${PORT}`));


