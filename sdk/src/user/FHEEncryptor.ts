import { createInstance, initSDK, SepoliaConfig } from '@zama-fhe/relayer-sdk/web';

/** Browser-safe Uint8Array → hex string (no Buffer needed) */
const toHex = (bytes: Uint8Array): string =>
    Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
import type { FhevmInstance } from '@zama-fhe/relayer-sdk/web';
import type { FHEInput } from '../utils/types';

/**
 * FHEEncryptor - Handles client-side encryption using @zama-fhe/relayer-sdk
 * Migration from deprecated `fhevmjs` to the official Zama Relayer SDK.
 */
export class FHEEncryptor {
    private instance: FhevmInstance | null = null;
    private initialized: boolean = false;
    private kmsContractAddress: string = '';
    private aclContractAddress: string = '';

    constructor() { }

    /**
     * Initialize the FHE instance using the Zama Relayer SDK
     * @param kmsContractAddress - Address of the KMS contract
     * @param aclContractAddress - Address of the ACL contract
     * @param provider - Ethers browser provider
     */
    async initialize(
        kmsContractAddress: string,
        aclContractAddress: string,
        provider: any
    ): Promise<void> {
        if (this.initialized) return;

        this.kmsContractAddress = kmsContractAddress;
        this.aclContractAddress = aclContractAddress;

        // Get the EIP-1193 provider from the window or the ethers provider wrapper
        let eip1193: any = undefined;
        if (typeof globalThis !== 'undefined' && 'window' in globalThis) {
            const win = (globalThis as any).window;
            if (win && 'ethereum' in win) {
                eip1193 = win.ethereum;
            }
        }
        if (!eip1193 && (provider as any).provider) {
            eip1193 = (provider as any).provider;
        }

        if (!eip1193) {
            throw new Error('You must provide a network URL or a EIP1193 object (eg: window.ethereum)');
        }

        // REQUIRED: Initialize the TFHE and TKMS WebAssembly modules before calling createInstance.
        // Without this, 'wasm.__wbindgen_malloc' will be undefined and cause a crash.
        await initSDK();

        // Use the official SepoliaConfig from @zama-fhe/relayer-sdk
        // SepoliaConfig already contains: relayerUrl, aclContractAddress, kmsContractAddress,
        // inputVerifierContractAddress, verifyingContractAddressDecryption, etc.
        this.instance = await createInstance({
            ...SepoliaConfig,
            // Override specific contract addresses with our deployed ones if provided
            kmsContractAddress: kmsContractAddress || SepoliaConfig.kmsContractAddress,
            aclContractAddress: aclContractAddress || SepoliaConfig.aclContractAddress,
            network: eip1193, // EIP-1193 provider
        });

        this.initialized = true;
    }

    /**
     * Encrypt age for FHE submission
     * @param age - The user's age to encrypt
     * @param userAddress - The user's wallet address
     * @param registryAddress - The target registry contract address
     */
    async encryptAge(age: number, userAddress: string, registryAddress: string): Promise<FHEInput> {
        if (!this.instance) {
            throw new Error('FHEEncryptor not initialized');
        }

        // Create encrypted input using the Relayer SDK API
        const input = this.instance.createEncryptedInput(registryAddress, userAddress);
        input.add32(age);

        const { inputProof, handles } = await input.encrypt();

        // handles[0] may already be a hex string or a Uint8Array depending on SDK version
        // We use `any` cast because the encrypt() return type varies across SDK versions
        const handle = handles[0] as any;
        const proof = inputProof as any;

        const handleHex = typeof handle === 'string'
            ? (handle.startsWith('0x') ? handle : '0x' + handle)
            : '0x' + toHex(handle as Uint8Array);
        const proofHex = typeof proof === 'string'
            ? (proof.startsWith('0x') ? proof : '0x' + proof)
            : '0x' + toHex(proof as Uint8Array);

        return {
            handle: handleHex,
            inputProof: proofHex,
        };
    }

    /**
     * Mock implementation for local testing without full Zama environment
     */
    async mockEncryptAge(age: number): Promise<FHEInput> {
        console.log(`Mock encrypting age: ${age}`);
        return {
            handle: '0x' + '0'.repeat(64),
            inputProof: '0x' + '0'.repeat(128),
        };
    }
}
