import {
  ethers,
  BrowserProvider,
  JsonRpcProvider,
  type Provider,
  type Signer,
  type Contract,
  type ContractTransactionResponse,
  type Eip1193Provider
} from 'ethers';
import type {
  ContractAddresses,
  Requirements,
  IssuerInfo,
  Proof,
  ZKProof,
  TransactionResult,
  ContractClientConfig,
  EventCallback
} from '../utils/types.js';

/**
 * Contract ABIs (synchronized with production contracts)
 */
const CREDENTIAL_REGISTRY_ABI = [
  'function isRegistered(address) view returns (bool)',
  'function trustedIssuers(address) view returns (bool)',
  'function registerIdentity(address user, bytes32 nullifier, bytes32 ageHandle, bytes ageProof)',
  'function identityNullifiers(bytes32) view returns (address)',
  'function getEncryptedAge(address user) view returns (uint256)',
  'function addIssuer(address issuer, string memory name)',
  'event IdentityRegistered(address indexed user, address indexed issuer)',
  'event IssuerAdded(address indexed issuer, string name)',
] as const;

const PROTOCOL_ACCESS_CONTROL_ABI = [
  'function hasAccess(address protocol, address user) view returns (bool)',
  'function protocolRequirements(address) view returns (uint32 minAge, bool isSet)',
  'function setRequirements(uint32 minAge)',
  'function requestAccessVerification(address user) external',
  'function callbackAccess(uint256 requestId, bool result)',
] as const;

/**
 * Contract Client Service
 * Handles direct smart contract interactions for read and write operations
 */
export class ContractClient {

  private provider: Provider | null = null;
  private credentialRegistry: Contract | null = null;
  private protocolAccessControl: Contract | null = null;
  private contractAddresses: ContractAddresses;
  private rpcUrl: string;

  /**
   * Create a new ContractClient instance
   * @param config - Configuration options including provider, contract addresses, and RPC URL
   */
  constructor(config?: ContractClientConfig) {
    this.contractAddresses = {
      CredentialRegistry: config?.contractAddresses?.CredentialRegistry || "0x4C950CA3857f691443dADD0882dc015E656Ae2AA",
      ZKVerifier: config?.contractAddresses?.ZKVerifier || '0x0000000000000000000000000000000000000000',
      ProtocolAccessControl: config?.contractAddresses?.ProtocolAccessControl || "0xDc218b412EE84D459Cdc962A1285746B843c508E",
    };


    this.rpcUrl = config?.rpcUrl || 'https://ethereum-sepolia-rpc.publicnode.com';


    if (config?.provider) {
      this.initialize(config.provider);
    }
  }

  /**
   * Initialize provider and contracts with robust support for various provider types
   * @param inputProvider - EIP-1193 provider (window.ethereum), Ethers Provider, or custom
   */
  initialize(inputProvider?: any): void {
    if (!inputProvider) {
      this.provider = new JsonRpcProvider(this.rpcUrl);
    } else if (inputProvider.request) {
      // It's an EIP-1193 provider (MetaMask, etc.)
      this.provider = new BrowserProvider(inputProvider as Eip1193Provider);
    } else {
      // Assume it's already an ethers-compatible provider
      this.provider = inputProvider as Provider;
    }

    this.credentialRegistry = new ethers.Contract(
      this.contractAddresses.CredentialRegistry,
      CREDENTIAL_REGISTRY_ABI,
      this.provider
    );
    this.protocolAccessControl = new ethers.Contract(
      this.contractAddresses.ProtocolAccessControl,
      PROTOCOL_ACCESS_CONTROL_ABI,
      this.provider
    );
  }

  async isRegistered(userAddress: string): Promise<boolean> {
    if (!this.credentialRegistry) this.initialize();
    try {
      return await this.credentialRegistry!.isRegistered(userAddress);
    } catch (error) {
      throw new Error(`Failed to check registration status: ${error}`);
    }
  }

  async getEncryptedAge(userAddress: string): Promise<bigint> {
    if (!this.credentialRegistry) this.initialize();
    try {
      return await this.credentialRegistry!.getEncryptedAge(userAddress);
    } catch (error) {
      throw new Error(`Failed to get encrypted age: ${error}`);
    }
  }

  async hasAccess(protocolAddress: string, userAddress: string): Promise<boolean> {
    if (!this.protocolAccessControl) this.initialize();
    try {
      return await this.protocolAccessControl!.hasAccess(protocolAddress, userAddress);
    } catch (error) {
      throw new Error(`Failed to check access: ${error}`);
    }
  }

  async getRequirements(protocolAddress: string): Promise<Requirements> {
    if (!this.protocolAccessControl) this.initialize();
    try {
      const [minAge, isSet] =
        await this.protocolAccessControl!.protocolRequirements(protocolAddress);

      return {
        minAge: Number(minAge),
        allowedJurisdictions: [],
        requireAccredited: false,
        isSet,
      };
    } catch (error) {
      throw new Error(`Failed to get protocol requirements: ${error}`);
    }
  }

  async registerIdentity(
    signer: Signer,
    userAddress: string,
    nullifier: string,
    ageHandle: string,
    ageProof: string
  ): Promise<TransactionResult> {
    if (!signer) throw new Error('Signer is required');
    const contract = new ethers.Contract(this.contractAddresses.CredentialRegistry, CREDENTIAL_REGISTRY_ABI, signer);
    try {
      const tx = await contract.registerIdentity(userAddress, nullifier, ageHandle, ageProof) as ContractTransactionResponse;
      const receipt = await tx.wait();
      return { transactionHash: tx.hash, receipt };
    } catch (error) {
      throw new Error(`Failed to register identity: ${error}`);
    }
  }

  async setRequirements(
    signer: Signer,
    minAge: number
  ): Promise<TransactionResult> {
    if (!signer) throw new Error('Signer is required');
    const contract = new ethers.Contract(this.contractAddresses.ProtocolAccessControl, PROTOCOL_ACCESS_CONTROL_ABI, signer);
    try {
      const tx = await contract.setRequirements(minAge) as ContractTransactionResponse;
      const receipt = await tx.wait();
      return { transactionHash: tx.hash, receipt };
    } catch (error) {
      throw new Error(`Failed to set requirements: ${error}`);
    }
  }

  async requestAccessVerification(
    signer: Signer,
    userAddress: string
  ): Promise<TransactionResult> {
    if (!signer) throw new Error('Signer is required');
    const contract = new ethers.Contract(this.contractAddresses.ProtocolAccessControl, PROTOCOL_ACCESS_CONTROL_ABI, signer);
    try {
      const tx = await contract.requestAccessVerification(userAddress) as ContractTransactionResponse;
      const receipt = await tx.wait();
      return { transactionHash: tx.hash, receipt };
    } catch (error) {
      throw new Error(`Failed to request access verification: ${error}`);
    }
  }

  getContractAddresses(): ContractAddresses { return this.contractAddresses; }
  getProvider(): Provider | null { return this.provider; }

}

