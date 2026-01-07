import crypto from 'node:crypto';
import type { Interface } from 'readline/promises';
import { convertWalletPublicKeyToBytes } from '@repo/kitties-api';
import { AirlogAPI } from '@repo/airlog-api';

const DEPLOY_OR_JOIN = `
You can do one of the following:
  1. Deploy a new AirLog contract
  2. Join an existing AirLog contract
  3. Exit
Which would you like to do? `;

const MAIN_MENU = `
You can do one of the following:
  0. Show my wallet pubkey
  1. Register airframe
  2. Authorize issuer
  3. Revoke issuer
  4. Add entry
  5. Transfer airframe
  6. Exit
  7. List Entries
Which would you like to do? `;

const hexToBytes32 = (hex: string): Uint8Array => {
  const h = hex.trim().startsWith('0x') ? hex.trim().slice(2) : hex.trim();
  if (h.length !== 64) throw new Error('Expected 32-byte hex (64 chars)');
  return Uint8Array.from(Buffer.from(h, 'hex'));
};

const norm = (x: string) =>
  x.trim().replace(/\s+/g, ' ').toUpperCase();

const shortHex = (hex: string, left = 8, right = 6) =>
  hex.length <= left + right ? hex : `${hex.slice(0, left)}…${hex.slice(-right)}`;


const deriveAirframeIdHex = (manufacturer: string, model: string, serial: string): string => {
  const s = `${norm(manufacturer)}|${norm(model)}|${norm(serial)}`;
  const digest = crypto.createHash('blake2b512').update(s, 'utf8').digest().subarray(0, 32);
  return Buffer.from(digest).toString('hex');
};

const promptAirframeId = async (rli: Interface): Promise<Uint8Array> => {
  const modeRaw = await rli.question('AirframeId input: (1) hex  (2) derive [default 2]: ');
  const mode = (modeRaw.trim() || '2');

  if (mode === '2') {
    const manufacturer = await rli.question('Manufacturer: ');
    const model = await rli.question('Model: ');
    const serial = await rli.question('Serial: ');
    const airframeIdHex = deriveAirframeIdHex(manufacturer, model, serial);
    console.log(`Derived airframeId: ${shortHex(airframeIdHex)} (full: ${airframeIdHex})`);
    return hexToBytes32(airframeIdHex);
  }

  const airframeIdHex = await rli.question('Enter airframeId (32-byte hex, 64 chars): ');
  return hexToBytes32(airframeIdHex);
};

// EntryType mapping must match your Compact enum order
const parseEntryType = (s: string): number => {
  const v = s.trim().toUpperCase();
  switch (v) {
    case 'ANNUAL': return 0;
    case 'HUNDRED_HOUR': return 1;
    case 'AD_COMPLIANCE': return 2;
    case 'REPAIR': return 3;
    case 'MOD_STC': return 4;
    case 'OVERHAUL': return 5;
    case 'OTHER': return 6;
    default:
      throw new Error('EntryType must be: ANNUAL, HUNDRED_HOUR, AD_COMPLIANCE, REPAIR, MOD_STC, OVERHAUL, OTHER');
  }
};

export const deployOrJoin = async (providers: any, rli: Interface): Promise<AirlogAPI | null> => {
  while (true) {
    const choice = await rli.question(DEPLOY_OR_JOIN);
    switch (choice) {
      case '1':
        console.log('Deploying AirLog contract...');
        return await AirlogAPI.deploy(providers, {});
      case '2': {
        const contractAddress = await rli.question('What is the contract address (in hex)? ');
        return await AirlogAPI.connect(providers, contractAddress.trim());
      }
      case '3':
        console.log('Exiting...');
        return null;
      default:
        console.log(`Invalid choice: ${choice}`);
    }
  }
};

export const mainLoop = async (providers: any, rli: Interface): Promise<void> => {
  const api = await deployOrJoin(providers, rli);
  if (!api) return;

  console.log(`Connected to contract: ${api.deployedContractAddress}`);

  while (true) {
    const choice = await rli.question(MAIN_MENU);
    try {
      switch (choice) {
        case '0': {
          const cpk = (providers as any).walletProvider.coinPublicKey;
          const pkBytes = convertWalletPublicKeyToBytes(cpk);

          console.log('\n=== Wallet Identity ===');
          console.log('Coin public key (bech32):');
          console.log(' ', cpk);
          console.log('\nIssuer key (32-byte hex, use this for authorizeIssuer):');
          console.log(' ', Buffer.from(pkBytes).toString('hex'));
          console.log();
          break;
        }

        case '1': {
          const airframeId = await promptAirframeId(rli);
          await api.registerAirframe(airframeId);
          console.log('✅ Airframe registered');
          break;
        }

        case '2': {
          const airframeId = await promptAirframeId(rli);
          const issuerPkHex = await rli.question('Enter issuer public key bytes (32-byte hex): ');
          await api.authorizeIssuer(airframeId, hexToBytes32(issuerPkHex));
          console.log('✅ Issuer authorized'); 
          break;
        }

        case '3': {
          const airframeId = await promptAirframeId(rli);
          const issuerPkHex = await rli.question('Enter issuer public key bytes (32-byte hex): ');
          await api.revokeIssuer(airframeId, hexToBytes32(issuerPkHex));
          console.log('✅ Issuer revoked');
          break;
        }

        case '4': {
          const airframeId = await promptAirframeId(rli);
          const entryTypeStr = await rli.question(
          'Entry type (ANNUAL, HUNDRED_HOUR, AD_COMPLIANCE, REPAIR, MOD_STC, OVERHAUL, OTHER): ',
          );
          const dateUtcStr = await rli.question('dateUtc (unix seconds): ');
          const tachStr = await rli.question('tachOrTT (integer, use 0 if unknown): ');
          const docHashHex = await rli.question('docHash (32-byte hex): ');
          const docRefHex = await rli.question('docRef (32-byte hex, use 00..00 if none): ');

          await api.addEntry(
          airframeId,
          parseEntryType(entryTypeStr) as any,
          BigInt(dateUtcStr),
          BigInt(tachStr),
          hexToBytes32(docHashHex),
          hexToBytes32(docRefHex),
          );
          console.log('✅ Entry added');
          break;
        }
        case '5': {
          const airframeId = await promptAirframeId(rli);
          const newOwnerPkHex = await rli.question('Enter new owner public key bytes (32-byte hex): ');
          await api.transferAirframe(airframeId, hexToBytes32(newOwnerPkHex));
          console.log('✅ Airframe transferred');
          break;
        }

        case '7': {
          const airframeId = await promptAirframeId(rli);

          const nextId = await api.getNextEntryId(airframeId);
          const n = Number(nextId);

          if (n <= 1) {
            console.log('No entries found.');
            break;
        }

          console.log(`\nEntries (1..${n - 1})\n`);

          for (let entryId = 1; entryId < n; entryId++) {
            const e = await api.getEntry(airframeId, BigInt(entryId));

          console.log(`Entry #${entryId}`);
          console.log(`  entryType: ${e.entryType}`);
          console.log(`  dateUtc: ${e.dateUtc}`);
          console.log(`  tachOrTT: ${e.tachOrTT}`);
          console.log(`  issuer: ${e.issuer ?? e.issuerPk ?? e.issuerKey}`);
          console.log(`  docHash: ${e.docHash}`);
          console.log(`  docRef: ${e.docRef}`);
          console.log('');
         }

          break;
        }

        case '6':
          console.log('Exiting...');
          return;

        default:
          console.log(`Invalid choice: ${choice}`);
      }
    } catch (e: any) {
      console.log(`❌ Error: ${e?.message ?? String(e)}`);
    }
  }
};


