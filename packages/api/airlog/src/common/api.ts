/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import { type ContractAddress } from '@midnight-ntwrk/compact-runtime';
import { deployContract, findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { assertIsContractAddress } from '@midnight-ntwrk/midnight-js-utils';
import { map, type Observable, retry } from 'rxjs';

import {
  Airlog,
  type Entry,
  type EntryType,
  witnesses,
  type AirlogPrivateState,
  createAirlogPrivateState,
} from '@repo/airlog-contract';

import type { AirlogProviders, DeployedAirlogContract } from './types.js';

// Single shared contract instance (same pattern as Kitties)
const airlogContractInstance = new Airlog.Contract(witnesses as any);

export interface AirlogState {
  readonly ownersCount?: bigint; // optional/placeholder
}

export class AirlogAPI {
  private constructor(
    public readonly deployedContract: DeployedAirlogContract,
    public readonly providers: AirlogProviders,
    logger?: { info: (...args: any[]) => void; error: (...args: any[]) => void },
  ) {
    this.deployedContractAddress = deployedContract.deployTxData.public.contractAddress;

    // Optional: you can wire a real state$ later once we add a “stats” circuit.
    this.state$ = this.providers.publicDataProvider
      .contractStateObservable(this.deployedContractAddress, { type: 'all' })
      .pipe(
        map((_contractState) => ({ ownersCount: undefined })),
        retry({ delay: 500 }),
      );

    this.logger = logger || { info: () => {}, error: () => {} };
  }

  private logger: { info: (...args: any[]) => void; error: (...args: any[]) => void };

  readonly deployedContractAddress: ContractAddress;
  readonly state$: Observable<AirlogState>;

  // -----------------------
  // Contract calls (circuits)
  // -----------------------

  async registerAirframe(airframeId: Uint8Array): Promise<void> {
    await this.deployedContract.callTx.registerAirframe(airframeId);
  }

  async authorizeIssuer(airframeId: Uint8Array, issuerPkBytes: Uint8Array): Promise<void> {
    await this.deployedContract.callTx.authorizeIssuer(airframeId, { bytes: issuerPkBytes } as any);
  }

  async revokeIssuer(airframeId: Uint8Array, issuerPkBytes: Uint8Array): Promise<void> {
    await this.deployedContract.callTx.revokeIssuer(airframeId, { bytes: issuerPkBytes } as any);
  }

  async addEntry(
    airframeId: Uint8Array,
    entryType: EntryType,
    dateUtc: bigint,
    tachOrTT: bigint,
    docHash: Uint8Array,
    docRef: Uint8Array,
  ): Promise<void> {
    await this.deployedContract.callTx.addEntry(
      airframeId,
      entryType,
      dateUtc as any,
      tachOrTT as any,
      docHash,
      docRef,
    );
  }

  async transferAirframe(airframeId: Uint8Array, newOwnerPkBytes: Uint8Array): Promise<void> {
    await this.deployedContract.callTx.transferAirframe(airframeId, { bytes: newOwnerPkBytes } as any);
  }
  
  async getNextEntryId(airframeId: Uint8Array): Promise<bigint> {
    const resp = await this.deployedContract.callTx.getNextEntryId(airframeId);
    return (resp as any).private.result as bigint;
  }

  async getEntry(airframeId: Uint8Array, entryId: bigint): Promise<any> {
    const resp = await this.deployedContract.callTx.getEntry(airframeId, entryId as any);
    return (resp as any).private.result;
  }

  // -----------------------
  // Static helpers (deploy/connect)
  // -----------------------

  private static validateProviders(providers: AirlogProviders): void {
    if (!providers?.publicDataProvider) throw new Error('PublicDataProvider is required');
    if (!providers?.privateStateProvider) throw new Error('PrivateStateProvider is required');
    if (!providers?.walletProvider) throw new Error('WalletProvider is required');
    if (!providers?.zkConfigProvider) throw new Error('ZKConfigProvider is required');
    if (!providers?.proofProvider) throw new Error('ProofProvider is required');
    if (!providers?.midnightProvider) throw new Error('MidnightProvider is required');
  }

  private static async getPrivateState(
    privateStateId: string,
    privateStateProvider: any,
  ): Promise<AirlogPrivateState> {
    const existing = await privateStateProvider.get(privateStateId);
    return (existing ?? createAirlogPrivateState()) as AirlogPrivateState;
  }

  static async deploy(providers: AirlogProviders, privateState: AirlogPrivateState = {}): Promise<AirlogAPI> {
    AirlogAPI.validateProviders(providers);

    const deployed = await deployContract(providers as any, {
      contract: airlogContractInstance as any,
      privateStateId: 'airlogPrivateState',
      initialPrivateState: await AirlogAPI.getPrivateState('airlogPrivateState', providers.privateStateProvider),
    });

    const typed = deployed as unknown as DeployedAirlogContract;
    return new AirlogAPI(typed, providers);
  }

  static async connect(providers: AirlogProviders, contractAddress: string): Promise<AirlogAPI> {
    AirlogAPI.validateProviders(providers);

    assertIsContractAddress(contractAddress);
    const addr = contractAddress as unknown as ContractAddress;
    const deployed = await findDeployedContract(providers as any, {
      contract: airlogContractInstance as any,
      contractAddress: addr,
      privateStateId: 'airlogPrivateState',
      initialPrivateState: await AirlogAPI.getPrivateState('airlogPrivateState', providers.privateStateProvider),
    });

    const typed = deployed as unknown as DeployedAirlogContract;
    return new AirlogAPI(typed, providers);
  }
}
