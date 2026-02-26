import { ethers } from "hardhat";

async function main() {
    const REGISTRY_ADDRESS = "0xAAafC153AcB233C1dc29Cb4Cb7B0dB9145dF3541";
    // The wallet address making the registerIdentity call (from the error log)
    const ISSUER_ADDRESS = "0xd5881AA749eEFd3Cb08d10f051aC776d664d0663";

    const [deployer] = await ethers.getSigners();
    console.log(`Using deployer: ${deployer.address}`);

    const registry = await ethers.getContractAt(
        [
            "function addIssuer(address issuer, string memory name) external",
            "function trustedIssuers(address) external view returns (bool)"
        ],
        REGISTRY_ADDRESS,
        deployer
    );

    // Check if already registered
    const alreadyIssuer = await registry.trustedIssuers(ISSUER_ADDRESS);
    if (alreadyIssuer) {
        console.log(`✅ ${ISSUER_ADDRESS} is already a trusted issuer.`);
        return;
    }

    console.log(`Adding ${ISSUER_ADDRESS} as a trusted issuer...`);
    const tx = await registry.addIssuer(ISSUER_ADDRESS, "Noah User Wallet");
    console.log(`Transaction sent: ${tx.hash}`);
    await tx.wait();
    console.log(`✅ Done! ${ISSUER_ADDRESS} is now a trusted issuer.`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
