import { Contract } from 'ethers';
import type { Signer, Provider, ContractTransactionReceipt } from 'ethers';
import {
  Requirements,
  TransactionResult,
  ProtocolClientConfig,
} from '../utils/types';

/**
 * Protocol Access Control ABI (FHE version)
 */
const PROTOCOL_ACCESS_CONTROL_ABI = [
  'function hasAccess(address protocol, address user) view returns (bool)',
  'function protocolRequirements(address) view returns (uint32 minAge, bool isSet)',
  'function setRequirements(uint32 minAge)',
  'function requestAccessVerification(address user)',
  'event AccessGranted(address indexed user, address indexed protocol, bool result)',
  'event RequirementsSet(address indexed protocol, uint32 minAge)',
] as const;

const DEFAULT_PROTOCOL_ACCESS_CONTROL_ADDRESS = '0xb92f19431617F5B34bFDCb06E3a80533939DD71b';

/**
 * ProtocolClient - High-level API for DeFi protocol integration
 */
export class ProtocolClient {
  private signer: Signer;
  private provider: Provider;
  private protocolAccessControlAddress: string;
  private contract: Contract | null = null;

  constructor(signer: Signer, config?: ProtocolClientConfig) {
    if (!signer) {
      throw new Error('Signer is required');
    }

    this.signer = signer;
    this.provider = config?.provider || signer.provider!;
    this.protocolAccessControlAddress =
      config?.protocolAccessControlAddress ||
      DEFAULT_PROTOCOL_ACCESS_CONTROL_ADDRESS;
  }

  private getContract(): Contract {
    if (!this.contract) {
      this.contract = new Contract(
        this.protocolAccessControlAddress,
        PROTOCOL_ACCESS_CONTROL_ABI,
        this.signer
      );
    }
    return this.contract;
  }

  private getReadOnlyContract(): Contract {
    return new Contract(
      this.protocolAccessControlAddress,
      PROTOCOL_ACCESS_CONTROL_ABI,
      this.provider
    );
  }

  /**
   * Set protocol requirements for KYC verification
   */
  async setRequirements(minAge: number): Promise<TransactionResult> {
    if (minAge < 0 || !Number.isInteger(minAge)) {
      throw new Error('minAge must be a non-negative integer');
    }

    try {
      const contract = this.getContract();
      const tx = await contract.setRequirements(minAge);
      const receipt = await tx.wait();

      return {
        transactionHash: tx.hash,
        receipt: receipt as ContractTransactionReceipt,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to set requirements: ${errorMessage}`);
    }
  }

  /**
   * Get protocol requirements
   */
  async getRequirements(protocolAddress?: string): Promise<Requirements> {
    const address = protocolAddress || (await this.signer.getAddress());

    try {
      const contract = this.getReadOnlyContract();
      const [minAge, isSet] = await contract.protocolRequirements(address);

      return {
        minAge: Number(minAge),
        allowedJurisdictions: [],
        requireAccredited: false,
        isSet,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to get requirements: ${errorMessage}`);
    }
  }

  /**
   * Request access verification for a user
   */
  async requestAccessVerification(userAddress: string): Promise<TransactionResult> {
    try {
      const contract = this.getContract();
      const tx = await contract.requestAccessVerification(userAddress);
      const receipt = await tx.wait();

      return {
        transactionHash: tx.hash,
        receipt: receipt as ContractTransactionReceipt,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to request access verification: ${errorMessage}`);
    }
  }

  /**
   * Check if a user has access to a protocol
   */
  async checkUserAccess(
    protocolAddress: string,
    userAddress: string
  ): Promise<boolean> {
    try {
      const contract = this.getReadOnlyContract();
      return await contract.hasAccess(protocolAddress, userAddress);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to check user access: ${errorMessage}`);
    }
  }
}
