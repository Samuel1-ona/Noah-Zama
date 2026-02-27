// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {FHE, euint32, externalEuint32} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig, ZamaConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/**
 * @title FHENoahRegistry
 * @notice Manages identity-wallet bindings and encrypted identity attributes.
 * @dev Uses @fhevm/solidity@0.11.1 which is compatible with @zama-fhe/relayer-sdk@0.4.1.
 *      ZamaEthereumConfig auto-selects the correct Coprocessor for Sepolia (chainId=11155111).
 */
contract FHENoahRegistry is ZamaEthereumConfig, AccessControl {
    bytes32 public constant ISSUER_MANAGER_ROLE = keccak256("ISSUER_MANAGER_ROLE");

    // Events
    event IdentityRegistered(address indexed user, address indexed issuer);
    event IdentityRevoked(address indexed user);
    event IssuerAdded(address indexed issuer, string name);

    // State
    mapping(address => bool) public isRegistered;
    mapping(address => euint32) internal encryptedAges; // user => encrypted age
    mapping(address => bool) public trustedIssuers;
    mapping(bytes32 => address) public identityNullifiers; // nullifier => user address

    modifier onlyIssuer() {
        require(trustedIssuers[msg.sender], "Not trusted issuer");
        _;
    }

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ISSUER_MANAGER_ROLE, msg.sender);
        // Explicitly call inherited config initialization just in case
        FHE.setCoprocessor(ZamaConfig.getEthereumCoprocessorConfig());
    }

    /**
     * @notice Explicitly re-initialize FHE configuration if needed.
     * @dev Sometimes the implicit inheritance constructor might not trigger as expected in some environments.
     */
    function initializeFHE() public onlyRole(DEFAULT_ADMIN_ROLE) {
        FHE.setCoprocessor(ZamaConfig.getEthereumCoprocessorConfig());
    }

    function addIssuer(address issuer, string memory name) external onlyRole(ISSUER_MANAGER_ROLE) {
        trustedIssuers[issuer] = true;
        emit IssuerAdded(issuer, name);
    }

    /**
     * @notice Register user identity with encrypted age and sybil protection.
     * @param user       The wallet address to bind.
     * @param nullifier  A unique deterministic hash of the user's identity (Sybil protection).
     * @param ageHandle  The external handle for the user's encrypted age.
     * @param ageProof   The FHE input proof from the relayer coprocessor.
     */
    function registerIdentity(
        address user,
        bytes32 nullifier,
        externalEuint32 ageHandle,
        bytes calldata ageProof
    ) external onlyIssuer {
        require(identityNullifiers[nullifier] == address(0), "Identity already registered");
        
        // FHE.fromExternal verifies the coprocessor proof and returns a live euint32
        euint32 encryptedAge = FHE.fromExternal(ageHandle, ageProof);
        encryptedAges[user] = encryptedAge;
        identityNullifiers[nullifier] = user;
        isRegistered[user] = true;
        
        emit IdentityRegistered(user, msg.sender);
    }

    function getEncryptedAge(address user) external view returns (euint32) {
        return encryptedAges[user];
    }
}
