import { stdin as input, stdout as output } from 'node:process';
import path from 'node:path';
import { createInterface, type Interface } from 'node:readline/promises';
import { type Logger } from 'pino';

import { type Resource } from '@midnight-ntwrk/wallet';
import { type Wallet } from '@midnight-ntwrk/wallet-api';

import {
  type Config,
  StandaloneConfig,
  buildWalletAndWaitForFunds,
  buildFreshWallet,
  configureProviders,
} from '@repo/kitties-api/node-api';

import { contractConfig } from '@repo/kitties-api';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';

import { mainLoop } from './cli.js';

const GENESIS_MINT_WALLET_SEED = '0000000000000000000000000000000000000000000000000000000000000001';

const WALLET_LOOP_QUESTION = `
You can do one of the following:
  1. Build a fresh wallet
  2. Build wallet from a seed
  3. Exit
Which would you like to do? `;

const buildWalletFromSeed = async (config: Config, rli: Interface): Promise<(Wallet & Resource) | null> => {
  try {
    const seed = await rli.question('Enter your wallet seed: ');
    return await buildWalletAndWaitForFunds(config, seed, '');
  } catch {
    return null;
  }
};

const buildWallet = async (config: Config, rli: Interface): Promise<(Wallet & Resource) | null> => {
  if (config instanceof StandaloneConfig) {
    return await buildWalletAndWaitForFunds(config, GENESIS_MINT_WALLET_SEED, '');
  }

  while (true) {
    const choice = await rli.question(WALLET_LOOP_QUESTION);
    switch (choice) {
      case '1':
        return await buildFreshWallet(config);
      case '2':
        return await buildWalletFromSeed(config, rli);
      case '3':
        return null;
      default:
        break;
    }
  }
};

export const run = async (config: Config, logger: Logger): Promise<void> => {
  const rli = createInterface({ input, output, terminal: true });

  const wallet = await buildWallet(config, rli);
  if (!wallet) return;

  // IMPORTANT: use AirLog zk config path (not kitties)
const airlogZkPath = path.resolve(
  process.cwd(),
  "packages",
  "contracts",
  "airlog",
  "src",
  "managed",
  "airlog"
);

const providers = await configureProviders(
  wallet,
  config,
  new NodeZkConfigProvider(airlogZkPath)
);

  await mainLoop(providers as any, rli);

  rli.close();
  await wallet.close();
  logger.info('Goodbye');
};
