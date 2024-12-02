<script lang="ts">
    import { generateSecretKey } from "nostr-tools";
    import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
    import BIP32Factory from 'bip32';
    import * as ecc from 'tiny-secp256k1';
    import { CashuMint, CashuWallet } from "@cashu/cashu-ts";
    import { npubEncode, nsecEncode } from "nostr-tools/nip19";
    
    const bip32 = BIP32Factory(ecc);
    const mintUrl = 'https://testnut.cashu.space';
    const MAX_PATH_VALUE = 2147483647;

    let xpub = '';
    let xprivStr = '';
    let ownerStatus: { type: string, message: string } | null = null;
    let derivationPath = '';
    let userInputPath = '';
    let pubKey = '';
    let privKey = '';
    let tokens = '';
    let userStatus: { type: string, message: string } | null = null;
    let unlockedTokens = '';
    
    const secretKey = generateSecretKey();
    const xpriv = bip32.fromSeed(secretKey);

    $: {
        xpub = xpriv.neutered().toBase58();
        xprivStr = xpriv.toBase58();
    }
    
    function generateRandomPath() {
        const levels = Array.from({ length: 5 }, () => 
            Math.floor(Math.random() * MAX_PATH_VALUE)
        );
        derivationPath = `m/${levels.join('/')}`;
        
        const derived = xpriv.neutered().derivePath(derivationPath);
        pubKey = bytesToHex(derived.publicKey);
        privKey = '';
        
        userStatus = {
            type: 'success',
            message: 'Random path generated and public key derived successfully'
        };
    }
    
    async function lockTokens() {
        try {
            const mint = new CashuMint(mintUrl);
            const wallet = new CashuWallet(mint);
            
            const mintRequest = await wallet.createMintQuote(100);
            // TODO: Add timelock (waiting for clarification...)
            const proofs = await wallet.mintProofs(100, mintRequest.quote, {
                pubkey: pubKey,
            });
            
            const token = {
                mint: mintUrl,
                proofs: proofs
            };
            
            tokens = JSON.stringify(token);
            userStatus = {
                type: 'success',
                message: 'Tokens successfully locked to the derived public key'
            };
        } catch (error) {
            userStatus = {
                type: 'error',
                message: `Failed to lock tokens: ${error}`
            };
        }
    }
    
    async function unlockTokens() {
        try {
            if (!tokens || !userInputPath) {
                throw new Error('Both tokens and derivation path are required');
            }

            if (!/^m\/\d+\/\d+\/\d+\/\d+\/\d+$/.test(userInputPath)) {
                throw new Error('Invalid derivation path format');
            }

            const pathNumbers = userInputPath.split('/').slice(1).map(Number);
            if (pathNumbers.some(num => num >= MAX_PATH_VALUE)) {
                throw new Error('Path contains invalid indices (must be less than 2³¹)');
            }

            const derived = xpriv.derivePath(userInputPath);
            const attemptPrivKey = bytesToHex(derived.privateKey!);

            const mint = new CashuMint(mintUrl);
            const wallet = new CashuWallet(mint);

            const tokenObj = JSON.parse(tokens);
            const receivedProofs = await wallet.receive(tokenObj, {
                privkey: attemptPrivKey
            });

            unlockedTokens = JSON.stringify(receivedProofs);
            ownerStatus = {
                type: 'success',
                message: 'Tokens successfully unlocked with the correct path'
            };
            privKey = attemptPrivKey;
        } catch (error) {
            ownerStatus = {
                type: 'error',
                message: `Unlock failed: ${error}`
            };
        }
    }
    
    function copyToClipboard(text: string) {
        navigator.clipboard.writeText(text);
        userStatus = {
            type: 'info',
            message: 'Copied to clipboard'
        };
    }
</script>

<div class="p-6">
    <header class="mb-6 text-center">
        <h1 class="text-3xl font-bold mb-2">Cashu Based Auctions(?)</h1>
        <h2 class="text-2xl font-bold mb-2">Interactive Key Derivation & Token Locking Demo</h2>
        <p class="text-gray-600">
            This demonstration shows how tokens can be locked to a derived public key and unlocked with the corresponding private key by sharing a derivation path,
            simulating interaction between a key owner and a user.
        </p>
    </header>

    <div class="grid grid-cols-2 gap-6">
        <div class="space-y-6">
            <div class="bg-blue-50 p-4 rounded-lg">
                <h3 class="text-lg font-semibold text-blue-800 mb-2">🔐 Key Owner's View</h3>
                <p class="text-sm text-blue-600 mb-4">
                    The key owner holds the master keys and can derive private keys to unlock tokens.
                </p>
                {#if ownerStatus}
                    <div class="p-2 rounded text-sm {
                        ownerStatus.type === 'error' ? 'bg-red-50 text-red-700' :
                        ownerStatus.type === 'success' ? 'bg-green-50 text-green-700' :
                        'bg-gray-50 text-gray-700'
                    }">
                    <p class=" text-lg font-bold">{ownerStatus.message}</p>
                </div>
                {/if}
            </div>

            <div class="space-y-4 p-4 border rounded-lg">
                <h4 class="font-medium">Master Keys</h4>
                <p class="text-sm text-gray-600">
                    By having a nsec the user can derive the xpub and xpriv
                </p>
                <div>
                    <label for="nsec" class="text-sm text-gray-600">Owner's nsec:</label>
                    <code class="block p-2 bg-gray-100 rounded text-sm break-all">
                        {nsecEncode(secretKey)}
                    </code>
                </div>
                <div>
                    <label for="xpriv" class="text-sm text-gray-600">Extended Private Key:</label>
                    <code class="block p-2 bg-gray-100 rounded text-sm break-all">
                        {xprivStr}
                    </code>
                </div>
                <div>
                    <label for="xpub" class="text-sm text-gray-600">Extended Public Key (shared with user):</label>
                    <code class="block p-2 bg-gray-100 rounded text-sm break-all">
                        {xpub}
                    </code>
                </div>
            </div>

            {#if tokens}
                <div class="space-y-4 p-4 border rounded-lg">
                    <h4 class="font-medium">4. Token Unlocking</h4>
                    <p class="text-sm text-gray-600">
                        Enter the derivation path to unlock the tokens:
                    </p>
                    <div class="space-y-2">
                        <input
                            type="text"
                            bind:value={userInputPath}
                            placeholder="e.g. m/123456/789012/345678/901234/567890"
                            class="w-full p-2 border rounded"
                        />
                        <button 
                            class="w-full px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700"
                            on:click={unlockTokens}
                        >
                            🔓 Attempt to Unlock Tokens
                        </button>
                    </div>

                    {#if unlockedTokens}
                        <div>
                            <label for="unlockedTokens" class="text-sm text-gray-600">Unlocked Token Proofs:</label>
                            <code class="block p-2 bg-gray-100 rounded text-sm break-all">
                                {unlockedTokens}
                            </code>
                        </div>
                        <div>
                            <label for="privKey" class="text-sm text-gray-600">Used Private Key:</label>
                            <code class="block p-2 bg-gray-100 rounded text-sm break-all">
                                {privKey}
                            </code>
                        </div>
                        <div>
                            <label for="privKey-nsec" class="text-sm text-gray-600">Used Private Key (nsec):</label>
                            <code class="block p-2 bg-gray-100 rounded text-sm break-all">
                                {nsecEncode(hexToBytes(privKey))}
                            </code>
                        </div>
                    {/if}

                    {#if ownerStatus}
                        <div class="p-2 rounded text-sm {
                            ownerStatus.type === 'error' ? 'bg-red-50 text-red-700' :
                            ownerStatus.type === 'success' ? 'bg-blue-50 text-blue-700' :
                            'bg-gray-50 text-gray-700'
                        }">
                            {ownerStatus.message}
                        </div>
                    {/if}
                </div>
            {/if}
        </div>

        <div class="space-y-6">
            <div class="bg-green-50 p-4 rounded-lg">
                <h3 class="text-lg font-semibold text-green-800 mb-2">👤 User's View</h3>
                <p class="text-sm text-green-600 mb-4">
                    The user can derive public keys and lock tokens using only the xpub.
                </p>
                {#if userStatus}
                <div class="p-2 rounded border text-sm {
                    userStatus.type === 'error' ? 'bg-red-50 text-red-700' :
                    userStatus.type === 'success' ? 'bg-green-50 text-green-700' :
                    'bg-gray-50 text-gray-700'
                }">
                    <p class=" text-lg font-bold">{userStatus.message}</p>
                </div>
            {/if}
            </div>

            <div class="space-y-4 p-4 border rounded-lg">
                <h4 class="font-medium">1. Path Generation</h4>
                <button 
                    class="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                    on:click={generateRandomPath}
                >
                    Generate Random Path
                </button>
                
                {#if derivationPath}
                    <div>
                        <label for="path" class="text-sm text-gray-600">Generated Path:</label>
                        <div class="flex gap-2 items-center">
                            <code class="flex-1 p-2 bg-gray-100 rounded">
                                {derivationPath}
                            </code>
                            <button 
                                class="px-2 py-1 border rounded hover:bg-gray-100"
                                on:click={() => copyToClipboard(derivationPath)}
                            >
                                Copy
                            </button>
                        </div>
                    </div>
                {/if}
            </div>

            {#if pubKey}
                <div class="space-y-4 p-4 border rounded-lg">
                    <h4 class="font-medium">2. Derived Public Key</h4>
                    <div>
                        <label for="pubKey" class="text-sm text-gray-600">Public Key (hex):</label>
                        <code class="block p-2 bg-gray-100 rounded text-sm break-all">
                            {pubKey}
                        </code>
                    </div>
                    <div>
                        <label for="npub" class="text-sm text-gray-600">Public Key (npub):</label>
                        <code class="block p-2 bg-gray-100 rounded text-sm break-all">
                            {npubEncode(pubKey)}
                        </code>
                    </div>
                </div>
            {/if}

            {#if pubKey}
                <div class="space-y-4 p-4 border rounded-lg">
                    <h4 class="font-medium">3. Token Operations</h4>
                    <button 
                        class="w-full px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                        on:click={lockTokens}
                    >
                        🔒 Lock Tokens to Public Key (Locking 100 sats)
                    </button>

                    {#if tokens}
                        <div>
                            <label for="tokens" class="text-sm text-gray-600">Locked Tokens:</label>
                            <code class="block p-2 bg-gray-100 rounded text-sm break-all">
                                {tokens}
                            </code>
                        </div>
                        <p class="font-bold">Now we should send the tokens to the user</p>
                    {/if}

                    {#if userStatus}
                        <div class="p-2 rounded text-sm {
                            userStatus.type === 'error' ? 'bg-red-50 text-red-700' :
                            userStatus.type === 'success' ? 'bg-green-50 text-green-700' :
                            'bg-gray-50 text-gray-700'
                        }">
                            {userStatus.message}
                        </div>
                    {/if}
                </div>
            {/if}
        </div>
    </div>
</div>