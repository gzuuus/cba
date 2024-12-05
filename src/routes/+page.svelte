<script lang="ts">
	import { generateSecretKey } from 'nostr-tools';
	import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
	import BIP32Factory from 'bip32';
	import * as ecc from 'tiny-secp256k1';
	import { CashuMint, CashuWallet } from '@cashu/cashu-ts';
	import { npubEncode, nsecEncode } from 'nostr-tools/nip19';
	import { onMount, onDestroy } from 'svelte';

	const bip32 = BIP32Factory(ecc);
	const mintUrl = 'https://testnut.cashu.space';
	const MAX_PATH_VALUE = 2147483647;

	let xpub = '';
	let xprivStr = '';
	let ownerStatus: { type: string; message: string } | null = null;
	let derivationPath = '';
	let userInputPath = '';
	let pubKey = '';
	let privKey = '';
	let tokens = '';
	let userStatus: { type: string; message: string } | null = null;
	let unlockedTokens = '';
	let locktime = 0;
	let timeRemaining = '';
	let countdownInterval: number;

	const secretKey = generateSecretKey();
	const xpriv = bip32.fromSeed(secretKey);

	$: {
		xpub = xpriv.neutered().toBase58();
		xprivStr = xpriv.toBase58();
	}

	function updateCountdown() {
		if (!locktime) return;

		const now = Math.floor(Date.now() / 1000);
		const remaining = locktime - now;

		if (remaining <= 0) {
			timeRemaining = 'Tokens are now redeemable!';
			clearInterval(countdownInterval);
		} else {
			const minutes = Math.floor(remaining / 60);
			const seconds = remaining % 60;
			timeRemaining = `${minutes}:${seconds.toString().padStart(2, '0')} until tokens are redeemable`;
		}
	}

	onMount(() => {
		if (locktime) {
			countdownInterval = setInterval(updateCountdown, 1000);
		}
	});

	onDestroy(() => {
		if (countdownInterval) {
			clearInterval(countdownInterval);
		}
	});

	function generateRandomPath() {
		const levels = Array.from({ length: 5 }, () => Math.floor(Math.random() * MAX_PATH_VALUE));
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
			locktime = Math.floor(Date.now() / 1000) + 10;

			const proofs = await wallet.mintProofs(100, mintRequest.quote, {
				p2pk: {
					pubkey: pubKey,
					locktime: locktime
				}
			});

			const token = {
				mint: mintUrl,
				proofs: proofs
			};

			tokens = JSON.stringify(token);

			if (countdownInterval) clearInterval(countdownInterval);
			countdownInterval = setInterval(updateCountdown, 1000);

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
			if (pathNumbers.some((num) => num >= MAX_PATH_VALUE)) {
				throw new Error('Path contains invalid indices (must be less than 2³¹)');
			}

			const currentTime = Math.floor(Date.now() / 1000);
			if (currentTime < locktime) {
				throw new Error(
					`Tokens are time-locked until ${new Date(locktime * 1000).toLocaleString()}`
				);
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

	async function redeemTokens() {
		try {
			if (!tokens) {
				throw new Error('Tokens are required');
			}

			const currentTime = Math.floor(Date.now() / 1000);
			if (currentTime < locktime) {
				throw new Error(
					`Tokens are time-locked until ${new Date(locktime * 1000).toLocaleString()}`
				);
			}

			const mint = new CashuMint(mintUrl);
			const wallet = new CashuWallet(mint);

			const tokenObj = JSON.parse(tokens);
			const receivedProofs = await wallet.receive(tokenObj);

			unlockedTokens = JSON.stringify(receivedProofs);
			ownerStatus = {
				type: 'success',
				message: 'Tokens successfully unlocked without derivation path'
			};
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
		<h1 class="mb-2 text-3xl font-bold">Cashu Based Auctions(?)</h1>
		<h2 class="mb-2 text-2xl font-bold">Interactive Key Derivation & Token Locking Demo</h2>
		<p class="text-gray-600">
			This demonstration shows how tokens can be locked to a derived public key and unlocked with
			the corresponding private key by sharing a derivation path, simulating interaction between a
			key owner and a user.
		</p>
	</header>

	{#if locktime}
		<div class="mb-6 rounded-lg bg-yellow-50 p-4 text-center">
			<h3 class="text-lg font-semibold text-yellow-800">⏳ Locktime Status</h3>
			<p class="text-yellow-600">{timeRemaining}</p>
			<p class="text-sm text-yellow-700">
				Locked until: {new Date(locktime * 1000).toLocaleString()}
			</p>
		</div>
	{/if}

	<div class="grid grid-cols-2 gap-6">
		<div class="space-y-6">
			<div class="rounded-lg bg-blue-50 p-4">
				<h3 class="mb-2 text-lg font-semibold text-blue-800">🔐 Key Owner's View</h3>
				<p class="mb-4 text-sm text-blue-600">
					The key owner holds the master keys and can derive private keys to unlock tokens.
				</p>
				{#if ownerStatus}
					<div
						class="rounded p-2 text-sm {ownerStatus.type === 'error'
							? 'bg-red-50 text-red-700'
							: ownerStatus.type === 'success'
								? 'bg-green-50 text-green-700'
								: 'bg-gray-50 text-gray-700'}"
					>
						<p class="text-lg font-bold">{ownerStatus.message}</p>
					</div>
				{/if}
			</div>

			<div class="space-y-4 rounded-lg border p-4">
				<h4 class="font-medium">Master Keys</h4>
				<p class="text-sm text-gray-600">By having a nsec the user can derive the xpub and xpriv</p>
				<div>
					<label for="nsec" class="text-sm text-gray-600">Owner's nsec:</label>
					<code class="block break-all rounded bg-gray-100 p-2 text-sm">
						{nsecEncode(secretKey)}
					</code>
				</div>
				<div>
					<label for="xpriv" class="text-sm text-gray-600">Extended Private Key:</label>
					<code class="block break-all rounded bg-gray-100 p-2 text-sm">
						{xprivStr}
					</code>
				</div>
				<div>
					<label for="xpub" class="text-sm text-gray-600"
						>Extended Public Key (shared with user):</label
					>
					<code class="block break-all rounded bg-gray-100 p-2 text-sm">
						{xpub}
					</code>
				</div>
			</div>

			{#if tokens}
				<div class="space-y-4 rounded-lg border p-4">
					<h4 class="font-medium">4. Token Unlocking</h4>
					<p class="text-sm text-gray-600">Enter the derivation path to unlock the tokens:</p>
					<div class="space-y-2">
						<input
							type="text"
							bind:value={userInputPath}
							placeholder="e.g. m/123456/789012/345678/901234/567890"
							class="w-full rounded border p-2"
						/>
						<button
							class="w-full rounded bg-purple-600 px-4 py-2 text-white hover:bg-purple-700"
							on:click={unlockTokens}
						>
							🔓 Attempt to Unlock Tokens
						</button>
						<button
							class="w-full rounded bg-purple-600 px-4 py-2 text-white hover:bg-purple-700"
							on:click={redeemTokens}
						>
							🔓 Attempt to Redeem Tokens
						</button>
					</div>

					{#if unlockedTokens}
						<div>
							<label for="unlockedTokens" class="text-sm text-gray-600"
								>Unlocked Token Proofs:</label
							>
							<code class="block break-all rounded bg-gray-100 p-2 text-sm">
								{unlockedTokens}
							</code>
						</div>
						{#if privKey}
							<div>
								<label for="privKey" class="text-sm text-gray-600">Used Private Key:</label>
								<code class="block break-all rounded bg-gray-100 p-2 text-sm">
									{privKey}
								</code>
							</div>
							<div>
								<label for="privKey-nsec" class="text-sm text-gray-600"
									>Used Private Key (nsec):</label
								>
								<code class="block break-all rounded bg-gray-100 p-2 text-sm">
									{nsecEncode(hexToBytes(privKey))}
								</code>
							</div>
						{/if}
					{/if}
				</div>
			{/if}
		</div>

		<div class="space-y-6">
			<div class="rounded-lg bg-green-50 p-4">
				<h3 class="mb-2 text-lg font-semibold text-green-800">👤 User's View</h3>
				<p class="mb-4 text-sm text-green-600">
					The user can derive public keys and lock tokens using only the xpub.
				</p>
				{#if userStatus}
					<div
						class="rounded border p-2 text-sm {userStatus.type === 'error'
							? 'bg-red-50 text-red-700'
							: userStatus.type === 'success'
								? 'bg-green-50 text-green-700'
								: 'bg-gray-50 text-gray-700'}"
					>
						<p class=" text-lg font-bold">{userStatus.message}</p>
					</div>
				{/if}
			</div>

			<div class="space-y-4 rounded-lg border p-4">
				<h4 class="font-medium">1. Path Generation</h4>
				<button
					class="w-full rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
					on:click={generateRandomPath}
				>
					Generate Random Path
				</button>

				{#if derivationPath}
					<div>
						<label for="path" class="text-sm text-gray-600">Generated Path:</label>
						<div class="flex items-center gap-2">
							<code class="flex-1 rounded bg-gray-100 p-2">
								{derivationPath}
							</code>
							<button
								class="rounded border px-2 py-1 hover:bg-gray-100"
								on:click={() => copyToClipboard(derivationPath)}
							>
								Copy
							</button>
						</div>
					</div>
				{/if}
			</div>

			{#if pubKey}
				<div class="space-y-4 rounded-lg border p-4">
					<h4 class="font-medium">2. Derived Public Key</h4>
					<div>
						<label for="pubKey" class="text-sm text-gray-600">Public Key (hex):</label>
						<code class="block break-all rounded bg-gray-100 p-2 text-sm">
							{pubKey}
						</code>
					</div>
					<div>
						<label for="npub" class="text-sm text-gray-600">Public Key (npub):</label>
						<code class="block break-all rounded bg-gray-100 p-2 text-sm">
							{npubEncode(pubKey)}
						</code>
					</div>
				</div>
			{/if}

			{#if pubKey}
				<div class="space-y-4 rounded-lg border p-4">
					<h4 class="font-medium">3. Token Operations</h4>
					<button
						class="w-full rounded bg-green-600 px-4 py-2 text-white hover:bg-green-700"
						on:click={lockTokens}
					>
						🔒 Lock Tokens to Public Key (Locking 100 sats)
					</button>

					{#if tokens}
						<div>
							<label for="tokens" class="text-sm text-gray-600">Locked Tokens:</label>
							<code class="block break-all rounded bg-gray-100 p-2 text-sm">
								{tokens}
							</code>
						</div>
						<p class="font-bold">Now we should send the tokens to the user</p>
					{/if}

					{#if userStatus}
						<div
							class="rounded p-2 text-sm {userStatus.type === 'error'
								? 'bg-red-50 text-red-700'
								: userStatus.type === 'success'
									? 'bg-green-50 text-green-700'
									: 'bg-gray-50 text-gray-700'}"
						>
							{userStatus.message}
						</div>
					{/if}
				</div>
			{/if}
		</div>
	</div>
</div>
