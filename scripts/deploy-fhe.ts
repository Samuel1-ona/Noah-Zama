import { ethers } from "hardhat";

async function main() {
    const signers = await ethers.getSigners();
    if (signers.length === 0) {
        throw new Error("No signers found. Check your PRIVATE_KEY in .env");
    }
    const [deployer] = signers;

    console.log("Deploying contracts with the account:", deployer.address);


    // 1. Deploy FHENoahRegistry
    console.log("Deploying FHENoahRegistry...");
    const FHENoahRegistry = await ethers.getContractFactory("FHENoahRegistry");
    const registry = await FHENoahRegistry.deploy();
    await registry.waitForDeployment();
    const registryAddress = await registry.getAddress();
    console.log("FHENoahRegistry deployed to:", registryAddress);

    // 2. Deploy FHEProtocolAccessControl
    console.log("Deploying FHEProtocolAccessControl...");
    const FHEProtocolAccessControl = await ethers.getContractFactory("FHEProtocolAccessControl");
    // FHEProtocolAccessControl(address _registry)
    const protocolAC = await FHEProtocolAccessControl.deploy(registryAddress);
    await protocolAC.waitForDeployment();
    const protocolACAddress = await protocolAC.getAddress();
    console.log("FHEProtocolAccessControl deployed to:", protocolACAddress);

    console.log("\nDeployment complete!");
    console.log("-------------------");
    console.log("FHENoahRegistry:", registryAddress);
    console.log("FHEProtocolAccessControl:", protocolACAddress);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
