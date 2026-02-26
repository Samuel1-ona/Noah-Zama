import { ethers } from "hardhat";

async function main() {
    const COPROCESSOR = "0x92C920834Ec8941d2C77D188936E1f7A6f49c127";
    const REGISTRY = "0x1f3C7d3a98cD93328e7Dae9ccf05d12d79E2839A";
    const USER = "0xd5881AA749eEFd3Cb08d10f051aC776d664d0663";

    const [signer] = await ethers.getSigners();

    // 1. Get InputVerifier from Coprocessor
    const coprocessor = new ethers.Contract(
        COPROCESSOR,
        ["function getInputVerifierAddress() external view returns (address)"],
        signer
    );

    try {
        const inputVerifier = await coprocessor.getInputVerifierAddress();
        console.log("✅ InputVerifier address:", inputVerifier);
    } catch (e: any) {
        console.log("❌ getInputVerifierAddress failed:", e.message?.substring(0, 200));
    }

    // 2. Check issuer status
    const registry = new ethers.Contract(
        REGISTRY,
        ["function trustedIssuers(address) view returns (bool)"],
        signer
    );
    const isIssuer = await registry.trustedIssuers(USER);
    console.log(`Issuer status for ${USER}:`, isIssuer);

    // 3. Static-call registerIdentity with ethers v6 API
    const registryFull = new ethers.Contract(
        REGISTRY,
        ["function registerIdentity(address user, bytes32 ageHandle, bytes calldata ageProof) external"],
        signer
    );

    try {
        const handle = "0xc2589922e4dad033c1a3033546b0ee47916257f726000000000000aa36a70400";
        const proof = "0x0101c2589922e4dad033c1a3033546b0ee47916257f726000000000000aa36a70400aa6764b79bb7c27f88d4a7bafcd6b6c923f9e90b53d8e55257a4ec9ee8d6f4dd29affe5c63d5778758f8fbb1c7820e924c83ce85abf4616710e32dfdd97ccda11c00";
        // ethers v6: use .registerIdentity.staticCall() instead of callStatic.registerIdentity()
        await registryFull["registerIdentity"].staticCall(USER, handle, proof);
        console.log("✅ registerIdentity would succeed!");
    } catch (e: any) {
        console.log("❌ registerIdentity revert:", e.message?.substring(0, 400));
        if (e.data) console.log("   Revert data:", typeof e.data === 'string' ? e.data : JSON.stringify(e.data));
        if (e.reason) console.log("   Reason:", e.reason);
        if (e.info?.error?.data) console.log("   Inner data:", e.info.error.data);
        if (e.shortMessage) console.log("   Short:", e.shortMessage);
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
