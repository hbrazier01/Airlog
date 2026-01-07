import { parentPort, workerData } from "node:worker_threads";
import { Buffer } from "node:buffer";
import { connectAirlogApi } from "./connectApi.mjs";

function hexToBytes32(hex) {
  const s0 = String(hex || "");
  const s = s0.trim();
  const h = s.startsWith("0x") ? s.slice(2) : s;

  if (h.length !== 64) throw new Error("Expected 32-byte hex (64 chars)");
  return Uint8Array.from(Buffer.from(h, "hex"));
}

function toHex(x) {
  if (!x) return null;
  if (typeof x === "string") return x;
  if (x?.bytes) x = x.bytes;
  if (x instanceof Uint8Array) return Buffer.from(x).toString("hex");
  if (Array.isArray(x)) return Buffer.from(x).toString("hex");
  return String(x);
}

const ENTRY_TYPE_LABELS = {
  0: "ANNUAL",
  1: "HUNDRED_HOUR",
  2: "AD_COMPLIANCE",
  3: "REPAIR",
  4: "MOD_STC",
  5: "OVERHAUL",
  6: "OTHER",
};

function toIsoFromUnixSeconds(sec) {
  const n = Number(sec);
  if (!Number.isFinite(n)) return null;
  return new Date(n * 1000).toISOString();
}

function isAllZeroHex(hex) {
  return typeof hex === "string" && /^0+$/.test(hex);
}


(async () => {
  const { airframeIdHex, entryId } = workerData;
  console.log("worker: airframeIdHex len =", String(airframeIdHex).length);
  console.log("worker: airframeIdHex =", String(airframeIdHex));


  const { api } = await connectAirlogApi();

  const airframeId = hexToBytes32(airframeIdHex);
  const e = await api.getEntry(airframeId, BigInt(entryId));

  const entryTypeNum =
    typeof e.entryType === "bigint" ? Number(e.entryType) : Number(e.entryType);
  const dateUtcNum =
    typeof e.dateUtc === "bigint" ? Number(e.dateUtc) : Number(e.dateUtc);
  const tachNum =
    typeof e.tachOrTT === "bigint" ? Number(e.tachOrTT) : Number(e.tachOrTT);

  const issuerHex = toHex(e.issuerPk ?? e.issuer);
  const docHashHex = toHex(e.docHash);
  const docRefHex = toHex(e.docRef);

  parentPort.postMessage({
    entryId: Number(entryId),

    // raw values (same meaning as before)
    entryType: entryTypeNum,
    dateUtc: dateUtcNum,
    tachOrTT: tachNum,
    issuerPk: issuerHex,
    docHash: docHashHex,
    docRef: docRefHex,

    // UI-friendly fields
    entryTypeLabel: ENTRY_TYPE_LABELS[entryTypeNum] ?? "UNKNOWN",
    dateUtcIso: toIsoFromUnixSeconds(dateUtcNum),
    isDocRefEmpty: isAllZeroHex(docRefHex),
  });


})().catch((err) => {
  parentPort.postMessage({ __error: err?.message ?? String(err) });
});

