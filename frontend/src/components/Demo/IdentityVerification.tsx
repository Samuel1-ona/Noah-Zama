import { useState, useEffect, useRef } from 'react';


import { motion, AnimatePresence } from 'framer-motion';
import {
    Upload,
    FileText,
    CheckCircle2,
    Loader2,
    AlertCircle,
    Cpu,
    Wallet,
    Send
} from 'lucide-react';



import { NoahSDK } from 'noah-zama';
import { ethers } from 'ethers';

declare global {
    interface Window {
        ethereum?: any;
    }
}

type Step = 'scan' | 'witness' | 'proof' | 'submit' | 'verified' | 'access';


interface IdentityVerificationProps {
    account: string | null;
    onConnect: () => Promise<void>;
    onSwitchNetwork: () => Promise<void>;
    isWrongNetwork: boolean;
}

export const IdentityVerification: React.FC<IdentityVerificationProps> = ({
    account,
    onConnect,
    onSwitchNetwork,
    isWrongNetwork
}) => {
    const [currentStep, setCurrentStep] = useState<Step>('scan');
    const [isProcessing, setIsProcessing] = useState(false);
    const [sdk, setSdk] = useState<NoahSDK | null>(null);


    const [error, setError] = useState<string | null>(null);
    const [fileName, setFileName] = useState<string | null>(null);

    const [extractedData, setExtractedData] = useState<any>(null);
    const [txHash, setTxHash] = useState<string | null>(null);


    const [fheInput, setFheInput] = useState<any>(null);
    const [isAlreadyVerified, setIsAlreadyVerified] = useState<boolean>(false);
    const [accessStatus, setAccessStatus] = useState<'none' | 'requesting' | 'pending' | 'granted' | 'denied'>('none');
    
    // Fetch protocol address from SDK instead of hardcoding or env
    const protocolAddress = sdk?.contracts.getContractAddresses().ProtocolAccessControl || '';

    const fileInputRef = useRef<HTMLInputElement>(null);



    // Initialize SDK
    useEffect(() => {
        const init = async () => {
            try {
                const sdkInstance = new NoahSDK({
                    rpcUrl: import.meta.env.VITE_RPC_URL
                });
                setSdk(sdkInstance);
            } catch (err) {
                console.error("Failed to initialize SDK:", err);
            }
        };
        init();
    }, []);

    // Check if user is already verified on-chain

    useEffect(() => {
        const checkVerification = async () => {
            if (sdk && account && currentStep === 'scan') {
                try {
                    const isRegistered = await sdk.contracts.isRegistered(account);
                    setIsAlreadyVerified(isRegistered);
                } catch (err) {
                    console.error("Error checking verification status:", err);
                }
            }
        };
        checkVerification();
    }, [sdk, account, currentStep]);

    const steps: { key: Step; label: string; icon: any }[] = [
        { key: 'scan', label: 'Scan', icon: <Upload size={18} /> },
        { key: 'witness', label: 'Witness', icon: <FileText size={18} /> },
        { key: 'proof', label: 'Encrypt', icon: <Cpu size={18} /> },
        { key: 'submit', label: 'Register', icon: <Send size={18} /> },
        { key: 'verified', label: 'Verified', icon: <CheckCircle2 size={18} /> },
    ];

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file && sdk) {
            setFileName(file.name);
            setIsProcessing(true);
            setError(null);
            try {
                const data = await sdk.extractPassportData(file);
                console.log("Extracted Data:", data);
                setExtractedData(data);
                setCurrentStep('witness');
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to extract data');
            } finally {
                setIsProcessing(false);
            }
        }
    };

    const handleNext = async () => {
        setIsProcessing(true);
        setError(null);
        try {
            if (currentStep === 'witness') {
                // Confirm extraction
                setTimeout(() => {
                    setIsProcessing(false);
                    setCurrentStep('proof');
                }, 1000);
            } else if (currentStep === 'proof') {
                if (!account || !sdk) throw new Error("Wallet not connected");

                // 1. Initialize FHE Encryption (Client-side)
                const provider = new ethers.BrowserProvider(window.ethereum as any);
                const signer = await provider.getSigner();

                // Using UserClient for encryption
                const { UserClient } = await import('noah-zama');
                const userClient = new UserClient(signer);

                // 2. Encrypt Age
                // IMPORTANT: We authorize the ISSUER address to use this handle
                // because the issuer will be the one signing the registration transaction.
                const issuerKey = import.meta.env.VITE_ISSUER_PRIVATE_KEY;
                if (!issuerKey) throw new Error("Issuer configuration missing (VITE_ISSUER_PRIVATE_KEY)");
                const issuerWallet = new ethers.Wallet(issuerKey);
                
                const age = Number(extractedData?.age) || 25;
                console.log("Encrypting age for FHE (authorized for Issuer)...");
                const result = await userClient.encryptIdentity({ 
                    age,
                    userAddress: issuerWallet.address 
                });

                setFheInput(result);
                setIsProcessing(false);
                setCurrentStep('submit');
            } else if (currentStep === 'submit') {
                if (!account || !sdk || !fheInput) throw new Error("Missing data or connection");

                const provider = new ethers.BrowserProvider(window.ethereum as any);

                console.log("Submitting transaction to register identity on FHEVM (signed by Issuer)...");
                try {
                    // Use a dedicated issuer wallet to sign the transaction (Simulation of backend/relayer)
                    const issuerKey = import.meta.env.VITE_ISSUER_PRIVATE_KEY;
                    if (!issuerKey) throw new Error("Issuer configuration missing (VITE_ISSUER_PRIVATE_KEY)");
                    
                    const issuerWallet = new ethers.Wallet(issuerKey, provider);
                    
                    const result = await sdk.contracts.registerIdentity(
                        issuerWallet,
                        account,
                        fheInput.handle,
                        fheInput.inputProof
                    );
                    setTxHash(result.transactionHash);

                    setIsProcessing(false);
                    setCurrentStep('verified');
                } catch (txErr: any) {
                    if (txErr.message.includes("already registered")) {
                        setIsAlreadyVerified(true);
                        setCurrentStep('verified');
                        return;
                    }
                    throw txErr;
                }
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error');
            setIsProcessing(false);
        }
    };

    const handleAccessRequest = async () => {
        if (!account || !sdk) return;
        setAccessStatus('requesting');
        try {
            const provider = new ethers.BrowserProvider(window.ethereum as any);
            const signer = await provider.getSigner();

            // 1. Request access
            console.log("Requesting access verification from Protocol contract...");
            const result = await sdk.contracts.requestAccessVerification(signer, account);
            console.log("Access request submitted:", result.transactionHash);

            // 2. Set to pending
            setAccessStatus('pending');

            // 3. Start polling for result (Simulation of async callback)
            const pollInterval = setInterval(async () => {
                try {
                    console.log("Polling for decryption result...");
                    const hasAccess = await sdk.contracts.hasAccess(protocolAddress, account);

                    if (hasAccess) {
                        setAccessStatus('granted');
                        clearInterval(pollInterval);
                    }
                } catch (err) {
                    console.error("Poll error:", err);
                }
            }, 5000);

            // Timeout after 60s
            setTimeout(() => clearInterval(pollInterval), 60000);

        } catch (err) {
            console.error("Access request failed:", err);
            setAccessStatus('none');
            setError(err instanceof Error ? err.message : 'Access request failed');
        }
    };



    const reset = () => {
        setCurrentStep('scan');
        setIsProcessing(false);
        setFileName(null);
        setExtractedData(null);
        setTxHash(null);
    };

    const renderContent = () => {
        if (error) {
            return (
                <div style={{ textAlign: 'center' }}>
                    <div style={{ color: '#EF4444', marginBottom: '1.5rem', background: 'rgba(239, 68, 68, 0.1)', padding: '1rem', borderRadius: '0.5rem', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                        <p style={{ fontWeight: 600 }}>Error encountered:</p>
                        <p style={{ fontSize: '0.875rem' }}>{error}</p>
                    </div>
                    <button className="btn btn-outline" onClick={reset} style={{ width: '100%' }}>Try Again</button>
                </div>
            );
        }

        switch (currentStep) {
            case 'scan':
                return (
                    <div style={{ textAlign: 'center' }}>
                        <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleFileChange}
                            style={{ display: 'none' }}
                            accept="image/*"
                        />
                        {isAlreadyVerified ? (
                            <div className="glass" style={{ padding: '2rem', marginBottom: '2.5rem', border: '1px solid rgba(34, 197, 94, 0.3)', background: 'rgba(34, 197, 94, 0.05)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', color: '#22C55E', marginBottom: '1rem' }}>
                                    <CheckCircle2 size={32} />
                                    <h3 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Already Verified</h3>
                                </div>
                                <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                                    Your wallet {account} is already associated with a valid Noah Credential on-chain.
                                </p>

                                <button className="btn btn-outline" onClick={() => setCurrentStep('verified')} style={{ width: '100%', borderColor: 'rgba(34, 197, 94, 0.4)', color: '#22C55E' }}>
                                    View Credential Status
                                </button>
                                <p style={{ marginTop: '1rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                    Or <span style={{ color: 'var(--primary)', cursor: 'pointer', textDecoration: 'underline' }} onClick={() => setIsAlreadyVerified(false)}>verify a new identity</span>
                                </p>
                            </div>
                        ) : (
                            <div className="glass" style={{
                                padding: '3rem',
                                border: '2px dashed var(--border)',
                                borderRadius: '1.5rem',
                                marginBottom: '2rem',
                                cursor: isProcessing ? 'default' : 'pointer',
                                opacity: isProcessing ? 0.7 : 1,
                                transition: 'all 0.2s ease'
                            }} onClick={() => !isProcessing && fileInputRef.current?.click()}>
                                {isProcessing ? (
                                    <Loader2 size={48} className="animate-spin" style={{ color: 'var(--primary)', marginBottom: '1rem' }} />
                                ) : (
                                    <Upload size={48} style={{ color: 'var(--primary)', marginBottom: '1rem' }} />
                                )}
                                <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                                    {isProcessing ? 'Processing Image...' : 'Upload Passport Photo'}
                                </h3>
                                <p style={{ color: 'var(--text-dim)' }}>
                                    {isProcessing ? 'Extracting MRZ data...' : 'Click to select or drag & drop'}
                                </p>
                            </div>
                        )}
                    </div>
                );
            case 'witness':
                return (
                    <div style={{ textAlign: 'center' }}>
                        <div className="glass" style={{ padding: '2rem', marginBottom: '2rem' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', textAlign: 'left', background: 'rgba(0,0,0,0.2)', padding: '1.5rem', borderRadius: '0.5rem' }}>
                                <div style={{ gridColumn: 'span 2', marginBottom: '0.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
                                    <p style={{ fontSize: '0.875rem', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <FileText size={16} className="text-primary" /> MRZ Data Extracted {fileName && `from ${fileName} `}
                                    </p>
                                </div>
                                <div>
                                    <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>First Name</p>
                                    <p style={{ fontWeight: 600 }}>{extractedData?.firstName || 'JONATHAN'}</p>
                                </div>
                                <div>
                                    <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Last Name</p>
                                    <p style={{ fontWeight: 600 }}>{extractedData?.lastName || 'DUNN'}</p>
                                </div>
                                <div>
                                    <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Passport No.</p>
                                    <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9rem' }}>{extractedData?.passportNumber || 'A20138271'}</p>
                                </div>
                                <div>
                                    <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Nationality</p>
                                    <p style={{ fontWeight: 600 }}>{extractedData?.nationality || 'USA'}</p>
                                </div>
                                <div style={{ gridColumn: 'span 2', marginTop: '0.5rem' }}>
                                    <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Raw MRZ</p>
                                    <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', wordBreak: 'break-all', opacity: 0.8 }}>
                                        P&lt;{extractedData?.issuingState || 'USA'}{extractedData?.lastName || 'DUNN'}&lt;&lt;{extractedData?.firstName || 'JONATHAN'}&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;
                                    </p>
                                </div>
                            </div>
                        </div>
                        <button className="btn btn-primary" onClick={handleNext} disabled={isProcessing} style={{ width: '100%' }}>
                            {isProcessing ? <Loader2 className="animate-spin" /> : 'Confirm Details'}
                        </button>
                    </div>
                );
            case 'proof':
                return (
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ marginBottom: '2.5rem' }}>
                            <Cpu size={64} className={isProcessing ? "animate-pulse" : ""} style={{ color: 'var(--primary)', marginBottom: '1.5rem' }} />
                            <h3 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>FHE Encryption</h3>
                            <p style={{ color: 'var(--text-muted)' }}>Encrypting age with Zama's FHEVM for confidential verification...</p>
                        </div>
                        {isProcessing ? (
                            <div style={{ width: '100%', height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                                <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: '100%' }}
                                    transition={{ duration: 1.5 }}
                                    style={{ height: '100%', background: 'var(--primary)' }}
                                />
                            </div>
                        ) : (
                            <button className="btn btn-primary" onClick={handleNext} style={{ width: '100%' }}>
                                Encrypt Age
                            </button>
                        )}
                    </div>
                );
            case 'submit':
                return (
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ textAlign: 'left', marginBottom: '2rem' }}>
                            {!account ? (
                                <button className="btn btn-outline" onClick={onConnect} style={{ width: '100%', marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                                    <Wallet size={18} /> Connect Wallet to Continue
                                </button>
                            ) : isWrongNetwork ? (
                                <div style={{ marginBottom: '1.5rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#EF4444', marginBottom: '1rem', background: 'rgba(239, 68, 68, 0.1)', padding: '0.75rem', borderRadius: '0.5rem' }}>
                                        <AlertCircle size={18} />
                                        <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>Wrong Network Connected</span>
                                    </div>
                                    <button onClick={onSwitchNetwork} className="btn btn-primary" style={{ width: '100%', background: '#EF4444', border: 'none' }}>
                                        Switch to Zama Devnet
                                    </button>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', color: 'var(--text-dim)', marginBottom: '1.5rem', background: 'rgba(255,255,255,0.05)', padding: '0.75rem', borderRadius: '0.5rem' }}>
                                    <Wallet size={18} className="text-primary" />
                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.875rem' }}>
                                        {account.slice(0, 6)}...{account.slice(-4)}
                                    </span>
                                    <span style={{ fontSize: '0.7rem', background: 'rgba(34, 197, 94, 0.2)', color: '#22C55E', padding: '0.1rem 0.4rem', borderRadius: '1rem' }}>Connected</span>
                                </div>
                            )}
                            <p style={{ color: 'var(--text-dim)', fontSize: '0.875rem' }}>You are about to register your identity with FHE-encrypted age on-chain.</p>
                        </div>
                        <button className="btn btn-primary" onClick={handleNext} disabled={isProcessing || !account || isWrongNetwork} style={{ width: '100%' }}>
                            {isProcessing ? <Loader2 className="animate-spin" /> : 'Register Identity'}
                        </button>
                    </div>
                );

            case 'verified':
                return (
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ position: 'relative', display: 'inline-block', marginBottom: '1.5rem' }}>
                            <CheckCircle2 size={80} style={{ color: '#22C55E' }} />
                            <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                style={{ position: 'absolute', top: -10, right: -10, background: 'var(--primary)', color: 'white', borderRadius: '50%', padding: '0.4rem', boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}
                            >
                                <CheckCircle2 size={16} />
                            </motion.div>
                        </div>
                        <h3 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '0.5rem' }}>Verified!</h3>
                        <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>
                            {isAlreadyVerified ? "We found your existing record. Your identity is active." : "Your identity is now registered with encrypted age on-chain."}
                        </p>

                        {(txHash || isAlreadyVerified) && (
                            <div className="glass" style={{ padding: '1rem', marginBottom: '2rem', textAlign: 'left', background: 'rgba(34, 197, 94, 0.05)', border: '1px solid rgba(34, 197, 94, 0.2)' }}>
                                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    {txHash ? "Transaction Confirmed" : "On-Chain Verified"}
                                </p>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {txHash || "Active on FHENoahRegistry"}
                                    </span>
                                </div>
                                <a
                                    href={txHash ? `https://sepolia.etherscan.io/tx/${txHash}` : `https://sepolia.etherscan.io`}
                                    target="_blank"
                                    rel="noreferrer"
                                    style={{ display: 'block', marginTop: '0.75rem', fontSize: '0.75rem', color: 'var(--primary)', textDecoration: 'none', fontWeight: 600 }}
                                >
                                    {txHash ? "View on Etherscan →" : "View Sepolia Explorer →"}
                                </a>

                            </div>

                        )}


                        <button className="btn btn-primary" onClick={() => setCurrentStep('access')} style={{ width: '100%', marginBottom: '1rem' }}>
                            Test Protocol Access
                        </button>
                        <button className="btn btn-outline" onClick={reset} style={{ width: '100%' }}>
                            Done
                        </button>
                    </div>

                );

            case 'access':
                return (
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ marginBottom: '2rem' }}>
                            <div style={{ display: 'inline-flex', padding: '1rem', background: 'rgba(var(--primary-rgb), 0.1)', borderRadius: '1rem', marginBottom: '1.5rem' }}>
                                <Cpu size={40} style={{ color: 'var(--primary)' }} />
                            </div>
                            <h3 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>Protocol Access Test</h3>
                            <p style={{ color: 'var(--text-muted)' }}>Simulate "Dave's Dex" requesting your age verification.</p>
                        </div>

                        <div className="glass" style={{ padding: '1.5rem', marginBottom: '2rem', textAlign: 'left', background: 'rgba(0,0,0,0.2)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>Dave's Dex (Protocol)</span>
                                <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>Req: Age {'>'} 18</span>
                            </div>

                            <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.05)', borderRadius: '0.5rem', marginBottom: '1rem' }}>
                                <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '0.5rem' }}>Status</p>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                    {accessStatus === 'none' && <span style={{ color: 'var(--text-muted)' }}>Idle</span>}
                                    {accessStatus === 'requesting' && <><Loader2 size={16} className="animate-spin text-primary" /> <span>Submitting...</span></>}
                                    {accessStatus === 'pending' && <><Loader2 size={16} className="animate-spin text-primary" /> <span>Waiting for KMS Decryption...</span></>}
                                    {accessStatus === 'granted' && <><CheckCircle2 size={16} style={{ color: '#22C55E' }} /> <span style={{ color: '#22C55E', fontWeight: 600 }}>Access Granted</span></>}
                                </div>
                            </div>

                            {accessStatus === 'none' ? (
                                <button className="btn btn-primary" onClick={handleAccessRequest} style={{ width: '100%' }}>
                                    Request Access
                                </button>
                            ) : accessStatus === 'granted' ? (
                                <div style={{ background: 'rgba(34, 197, 94, 0.1)', padding: '0.75rem', borderRadius: '0.5rem', textAlign: 'center' }}>
                                    <p style={{ fontSize: '0.875rem', color: '#22C55E' }}>Success! Protocol verified your age privately.</p>
                                </div>
                            ) : null}
                        </div>

                        <button className="btn btn-outline" onClick={() => setCurrentStep('verified')} style={{ width: '100%' }}>
                            Back
                        </button>
                    </div>
                );

        }
    };

    return (
        <section className="container" style={{ padding: '4rem 0' }}>
            <div className="glass" style={{
                maxWidth: '600px',
                margin: '0 auto',
                padding: '3rem',
                boxShadow: '0 40px 100px rgba(0,0,0,0.6)',
                border: '1px solid var(--border)'
            }}>
                {/* Stepper Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3rem', position: 'relative' }}>
                    <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 2, background: 'var(--border)', transform: 'translateY(-50%)', zIndex: 0 }} />
                    {steps.map((step, i) => {
                        const isActive = currentStep === step.key;
                        const isCompleted = steps.findIndex(s => s.key === currentStep) > i;

                        return (
                            <div key={step.key} style={{ zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                                <div style={{
                                    width: 36,
                                    height: 36,
                                    borderRadius: '50%',
                                    background: isCompleted || isActive ? 'var(--primary)' : 'var(--bg-dark)',
                                    border: `2px solid ${isActive || isCompleted ? 'var(--primary)' : 'var(--border)'}`,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: isCompleted || isActive ? 'white' : 'var(--text-dim)',
                                    transition: 'all 0.3s ease'
                                }}>
                                    {step.icon}
                                </div>
                                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: isActive ? 'var(--primary)' : 'var(--text-dim)' }}>{step.label}</span>
                            </div>
                        );
                    })}
                </div>

                {/* Content Area */}
                <div style={{ minHeight: '300px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={currentStep}
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            transition={{ duration: 0.3 }}
                        >
                            {renderContent()}
                        </motion.div>
                    </AnimatePresence>
                </div>
            </div>
        </section>
    );
};
