
import path from "node:path";

import {
  StandaloneConfig,
  buildWalletAndWaitForFunds,
  configureProviders,
} from "@repo/kitties-api/node-api";

import { NodeZkConfigProvider } from "@midnight-ntwrk/midnight-js-node-zk-config-provider";
import { AirlogAPI } from "@repo/airlog-api";

const GENESIS_MINT_WALLET_SEED =
  "0000000000000000000000000000000000000000000000000000000000000001";

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} env var is required`);
  return v;
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

export async function connectAirlogApi() {
  const config = new StandaloneConfig();

  // ✅ Override defaults for Docker networking
  config.node = "http://node:9944";
  config.indexer = "http://indexer:8088/api/v1/graphql";
  config.indexerWS = "ws://indexer:8088/api/v1/graphql/ws";
  config.proofServer = "http://proof-server:6300";

  console.log("connect: building wallet (genesis seed)...");
  const wallet = await withTimeout(
    buildWalletAndWaitForFunds(config, GENESIS_MINT_WALLET_SEED, ""),
    60000,
    "buildWalletAndWaitForFunds"
  );
  console.log("connect: wallet built");

  const airlogZkPath = path.resolve(
  process.cwd(),
  "packages",
  "contracts",
  "airlog",
  "src",
  "managed",
  "airlog"
  );

  console.log("connect: configuring providers...");
  const providers = await withTimeout(
    configureProviders(wallet, config, new NodeZkConfigProvider(airlogZkPath)),
    20000,
    "configureProviders"
  );
  console.log("connect: providers ready");

  const contractAddress = requireEnv("AIRLOG_CONTRACT_ADDRESS");

  console.log("connect: creating AirlogAPI...");
  const api = await AirlogAPI.connect(providers, contractAddress);
  console.log("connect: api ready");

  return { api, wallet };
}


