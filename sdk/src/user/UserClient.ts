import { ethers, type Signer } from 'ethers';
import type { Requirements, TransactionResult, ContractAddresses } from '../utils/types';
import { ContractClient } from '../core/ContractClient';
import { FHEEncryptor } from './FHEEncryptor';
import { IdentityManager } from '../utils/identity';

/**
 * Credential data structure for FHE encryption
 */
export interface Credential {
  age: number;
  userAddress?: string;
  nullifier?: string; // Optional: can be generated from PII
}

/**
 * FHE Input result
 */
export interface FHEInputResult {
  handle: string;
  inputProof: string;
  success: boolean;
}

/**
 * UserClient configuration options
 */
export interface UserClientConfig {
  contractAddresses?: Partial<ContractAddresses>;
  rpcUrl?: string;
  mockMode?: boolean;
}

/**
 * UserClient - High-level API for end-user applications
 */
export class UserClient {
  private signer: Signer;
  private contractClient: ContractClient;
  private fheEncryptor: FHEEncryptor;
  private mockMode: boolean;
  private identityManager: IdentityManager;

  constructor(signer: Signer, config: UserClientConfig = {}) {
    if (!signer) {
      throw new Error('Signer is required');
    }

    this.signer = signer;
    this.mockMode = config.mockMode || false;

    this.contractClient = new ContractClient({
      provider: signer.provider || undefined,
      contractAddresses: config.contractAddresses as ContractAddresses | undefined,
      rpcUrl: config.rpcUrl,
    });

    this.fheEncryptor = new FHEEncryptor();
    this.identityManager = new IdentityManager();
  }

  /**
   * Encrypt user identity attributes using FHE
   */
  async encryptIdentity(
    credential: Credential
  ): Promise<FHEInputResult> {
    if (this.mockMode) {
      const mockResult = await this.fheEncryptor.mockEncryptAge(credential.age);
      return { ...mockResult, success: true };
    }

    try {
      await this.fheEncryptor.initialize(
        '', // Use SepoliaConfig defaults — Zama's official KMS contract
        '', // Use SepoliaConfig defaults — Zama's official ACL contract
        this.signer.provider
      );


      const userAddress = credential.userAddress || (await this.signer.getAddress());
      const registryAddress = this.contractClient.getContractAddresses().CredentialRegistry;

      const result = await this.fheEncryptor.encryptAge(credential.age, userAddress, registryAddress);


      return {
        handle: result.handle,
        inputProof: result.inputProof,
        success: true,
      };
    } catch (error: any) {
      throw new Error(`Failed to encrypt identity: ${error.message || 'Unknown error'}`);
    }
  }

  /**
   * Register identity on-chain with encrypted age
   */
  async registerIdentity(
    userAddress: string,
    fheInput: FHEInputResult,
    nullifier?: string
  ): Promise<TransactionResult> {
    try {
      // If no nullifier provided, generate a deterministic one for demo purposes
      // In production, this would be hash(PassportNumber + Salt)
      const finalNullifier = nullifier || ethers.id(userAddress + "_identity_v1");

      return await this.contractClient.registerIdentity(
        this.signer,
        userAddress,
        finalNullifier,
        fheInput.handle,
        fheInput.inputProof
      );
    } catch (error: any) {
      throw new Error(`Failed to register identity: ${error.message || 'Unknown error'}`);
    }
  }

  /**
   * Request access verification for a protocol
   */
  async requestAccessVerification(
    userAddress?: string
  ): Promise<TransactionResult> {
    const finalUserAddress = userAddress || (await this.signer.getAddress());

    try {
      return await this.contractClient.requestAccessVerification(
        this.signer,
        finalUserAddress
      );
    } catch (error: any) {
      throw new Error(
        `Failed to request access verification: ${error.message || 'Unknown error'}`
      );
    }
  }

  /**
   * Check if a user is registered
   */
  async isRegistered(userAddress?: string): Promise<boolean> {
    const finalUserAddress = userAddress || (await this.signer.getAddress());

    try {
      return await this.contractClient.isRegistered(finalUserAddress);
    } catch (error: any) {
      throw new Error(
        `Failed to check registration status: ${error.message || 'Unknown error'}`
      );
    }
  }

  /**
   * Get protocol requirements
   */
  async getProtocolRequirements(protocolAddress: string): Promise<Requirements> {
    try {
      return await this.contractClient.getRequirements(protocolAddress);
    } catch (error: any) {
      throw new Error(
        `Failed to get protocol requirements: ${error.message || 'Unknown error'}`
      );
    }
  }

  /**
   * Check if user has access to a protocol
   */
  async hasAccess(
    protocolAddress: string,
    userAddress?: string
  ): Promise<boolean> {
    const finalUserAddress = userAddress || (await this.signer.getAddress());

    try {
      return await this.contractClient.hasAccess(protocolAddress, finalUserAddress);
    } catch (error: any) {
      throw new Error(
        `Failed to check access: ${error.message || 'Unknown error'}`
      );
    }
  }
}
