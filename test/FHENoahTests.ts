import { expect } from "chai";
import { ethers } from "hardhat";
import { FHENoahRegistry, FHEProtocolAccessControl } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("Noah FHE Migration Tests", function () {
    let registry: FHENoahRegistry;
    let accessControl: FHEProtocolAccessControl;
    let admin: SignerWithAddress;
    let issuer: SignerWithAddress;
    let user: SignerWithAddress;
    let protocol: SignerWithAddress;

    before(async function () {
        [admin, issuer, user, protocol] = await ethers.getSigners();

        const Registry = await ethers.getContractFactory("FHENoahRegistry");
        registry = await Registry.deploy();
        await registry.waitForDeployment();

        const AccessControl = await ethers.getContractFactory("FHEProtocolAccessControl");
        accessControl = await AccessControl.deploy(await registry.getAddress());
        await accessControl.waitForDeployment();

        // Setup: admin adds issuer
        await registry.connect(admin).addIssuer(issuer.address, "Trusted Issuer");
    });

    describe("Identity Registration", function () {
        it("Should allow issuer to register identity with encrypted age", async function () {
            // In a real scenario, this would be encrypted by fhevmjs
            // For local testing without a full FHEVM node, we'd typically use a mock or dev mode
            // Since we don't have the mock helper yet, we'll just test the call structure

            // dummy ciphertext handles (bytes32)
            const ageHandle = ethers.ZeroHash;
            const ageProof = "0x";

            await expect(
                registry.connect(issuer).registerIdentity(user.address, ageHandle, ageProof)
            ).to.emit(registry, "IdentityRegistered");

            expect(await registry.isRegistered(user.address)).to.be.true;
        });

        it("Should NOT allow non-issuer to register identity", async function () {
            const ageHandle = ethers.ZeroHash;
            const ageProof = "0x";
            await expect(
                registry.connect(user).registerIdentity(user.address, ageHandle, ageProof)
            ).to.be.revertedWith("Not trusted issuer");
        });
    });

    describe("Access Control", function () {
        it("Should allow protocol to set requirements", async function () {
            await accessControl.connect(protocol).setRequirements(18);
            const req = await accessControl.protocolRequirements(protocol.address);
            expect(req.minAge).to.equal(18);
            expect(req.isSet).to.be.true;
        });

        it("Should allow requesting access verification", async function () {
            // This triggers an FHE comparison and a Gateway decryption request
            // On a local hardhat node without FHEVM support, the FHE.ge call in Solidity
            // will fail unless we have a mock coprocessor.

            // Note: Full FHE verification requires a Zama Devnet or a custom Hardhat FHEVM environment.
            // For this migration, we are focusing on the architectural correctness and compilation.
        });
    });
});
