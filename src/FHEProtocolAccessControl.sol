// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, euint32, ebool} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig, ZamaConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {Gateway} from "fhevm/gateway/lib/Gateway.sol";
import {GatewayCaller} from "fhevm/gateway/GatewayCaller.sol";
import {SepoliaZamaGatewayConfig} from "fhevm/config/ZamaGatewayConfig.sol";
import "./FHENoahRegistry.sol";

/**
 * @title FHEProtocolAccessControl
 * @notice Manages confidential access control using FHE comparisons and asynchronous decryption
 * @dev Upgraded to use @fhevm/solidity@0.11.1 types (bytes32 handles).
 */
contract FHEProtocolAccessControl is ZamaEthereumConfig, SepoliaZamaGatewayConfig, GatewayCaller {
    
    struct Requirements {
        uint32 minAge;
        bool isSet;
    }

    mapping(address => Requirements) public protocolRequirements;
    mapping(address => mapping(address => bool)) public hasAccess;
    mapping(uint256 => address) private requestToUser;
    mapping(uint256 => address) private requestToProtocol;

    FHENoahRegistry public registry;

    constructor(address _registry) {
        registry = FHENoahRegistry(_registry);
        // Explicitly call inherited config initialization
        FHE.setCoprocessor(ZamaConfig.getEthereumCoprocessorConfig());
    }

    function setRequirements(uint32 minAge) external {
        protocolRequirements[msg.sender] = Requirements({
            minAge: minAge,
            isSet: true
        });
    }

    /**
     * @notice Request access verification (Asynchronous)
     * @param user The user address to check
     */
    function requestAccessVerification(address user) external {
        Requirements memory req = protocolRequirements[msg.sender];
        require(req.isSet, "Requirements not set");
        require(registry.isRegistered(user), "User not registered");

        euint32 userAge = registry.getEncryptedAge(user);
        
        // FHE comparison: userAge >= minAge
        // In @fhevm/solidity, constants are trivial-encrypted automatically or use FHE.asEuint32
        ebool isOldEnough = FHE.ge(userAge, FHE.asEuint32(req.minAge));
        
        // Prepare decryption request
        uint256[] memory cts = new uint256[](1);
        // Directly cast the bytes32 handle to uint256 for the legacy Gateway
        cts[0] = uint256(ebool.unwrap(isOldEnough));

        uint256 requestId = Gateway.requestDecryption(
            cts,
            this.callbackAccess.selector,
            0,
            block.timestamp + 1 hours,
            false
        );

        requestToUser[requestId] = user;
        requestToProtocol[requestId] = msg.sender;
    }

    /**
     * @notice Callback for decryption result
     * @param requestId The request ID
     * @param result De-serialized decrypted boolean
     */
    function callbackAccess(uint256 requestId, bool result) public onlyGateway returns (bool) {
        address user = requestToUser[requestId];
        address protocol = requestToProtocol[requestId];
        
        if (result) {
            hasAccess[protocol][user] = true;
        }

        delete requestToUser[requestId];
        delete requestToProtocol[requestId];
        return true;
    }
}
