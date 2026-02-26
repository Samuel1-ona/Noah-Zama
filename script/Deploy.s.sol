// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {FHENoahRegistry} from "../src/FHENoahRegistry.sol";
import {FHEProtocolAccessControl} from "../src/FHEProtocolAccessControl.sol";

contract DeployScript is Script {
    function run() external {
        uint256 deployerPrivateKey;
        if (vm.envExists("PK")) {
            deployerPrivateKey = vm.envUint("PK");
        } else {
            deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        }
        
        vm.startBroadcast(deployerPrivateKey);
        
        console.log("=== Noah Deployment on Zama FHEVM ===");
        
        // 1. Deploy FHE Registry
        console.log("Deploying FHENoahRegistry...");
        FHENoahRegistry registry = new FHENoahRegistry();
        console.log("FHENoahRegistry deployed at:", address(registry));
        
        // 2. Deploy FHE Protocol Access Control
        console.log("Deploying FHEProtocolAccessControl...");
        FHEProtocolAccessControl accessControl = new FHEProtocolAccessControl(
            address(registry)
        );
        console.log("FHEProtocolAccessControl deployed at:", address(accessControl));
        
        // 3. Initialization
        address deployer = vm.addr(deployerPrivateKey);
        registry.addIssuer(deployer, "Noah Genesis Issuer");
        console.log("Registered deployer as Issuer:", deployer);

        // 4. Grant roles to the provided owner address
        address ownerAddress = 0xd5881AA749eEFd3Cb08d10f051aC776d664d0663;
        console.log("Setting owner address:", ownerAddress);
        registry.grantRole(registry.DEFAULT_ADMIN_ROLE(), ownerAddress);
        registry.grantRole(registry.ISSUER_MANAGER_ROLE(), ownerAddress);
        console.log("Granted Admin and Issuer Manager roles to owner");
        
        vm.stopBroadcast();
        
        console.log("\n=== Deployment Summary ===");
        console.log("Registry: ", address(registry));
        console.log("AccessControl: ", address(accessControl));
        console.log("==========================\n");
    }
}

