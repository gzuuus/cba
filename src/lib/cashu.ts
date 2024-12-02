    import { CashuMint, CashuWallet, getEncodedTokenV4, MeltQuoteState, MintQuoteState, type MeltQuoteResponse, type MintQuoteResponse, type Proof, type Token } from "@cashu/cashu-ts";
	import { sumProofs } from "@cashu/cashu-ts/dist/lib/es5/utils";
    const mintUrl = 'https://testnut.cashu.space';
    const mintAmount = 2050;
    const mint = new CashuMint(mintUrl);

    const wallet = new CashuWallet(mint);
    const externalInvoice =
	'lnbc20u1p3u27nppp5pm074ffk6m42lvae8c6847z7xuvhyknwgkk7pzdce47grf2ksqwsdpv2phhwetjv4jzqcneypqyc6t8dp6xu6twva2xjuzzda6qcqzpgxqyz5vqsp5sw6n7cztudpl5m5jv3z6dtqpt2zhd3q6dwgftey9qxv09w82rgjq9qyyssqhtfl8wv7scwp5flqvmgjjh20nf6utvv5daw5h43h69yqfwjch7wnra3cn94qkscgewa33wvfh7guz76rzsfg9pwlk8mqd27wavf2udsq3yeuju';

    let proofs: Proof[] = [];
    let sentProofs: Proof[] = [];

    const runWalletExample = async () => {
	try {
        console.log(wallet);
        mintEcash();

    } catch (error) {
        console.error(error);
    }

};

const mintEcash = async function () {
			// with this command, we can initiate the creation of some ecash.
			// The mint will return a request, that we have to fullfil in order for the ecash to be issued.
			// (in most cases this will be a lightning invoice that needs to be paid)
			console.log('Requesting a mint quote for' + mintAmount + 'satoshis.');
			const quote = await wallet.createMintQuote(mintAmount);

			console.log('Invoice to pay, in order to fullfill the quote: ' + quote.request);

			//check if an error occurred in the creation of the quote
			if (quote.error) {
				console.error(quote.error, quote.code, quote.detail);
				return;
			}

			// After some time of waiting, let's ask the mint if the request has been fullfilled.
			setTimeout(async () => await checkMintQuote(quote), 1000);

			const checkMintQuote = async (q: MintQuoteResponse) => {
				// with this call, we can check the current status of a given quote
				console.log('Checking the status of the quote: ' + q.quote);
				const quote = await wallet.checkMintQuote(q.quote);
				if (quote.error) {
					console.error(quote.error, quote.code, quote.detail);
					return;
				}
				if (quote.state === MintQuoteState.PAID) {
					//if the quote was paid, we can ask the mint to issue the signatures for the ecash
					const response = await wallet.mintProofs(mintAmount, quote.quote);
					console.log(`minted proofs: ${response.map((p) => p.amount).join(', ')} sats`);

					// let's store the proofs in the storage we previously created
					proofs = response;

					// after successfull minting, let's try to send some ecash
					sendEcash(10);
				} else if (quote.state === MintQuoteState.ISSUED) {
					// if the quote has already been issued, we will receive an error if we try to mint again
					console.error('Quote has already been issued');
					return;
				} else {
					// if the quote has not yet been paid, we will wait some more to get the status of the quote again
					setTimeout(async () => await checkMintQuote(q), 1000);
				}
			};
		};

const sendEcash = async (amount: number) => {
			// to send some ecash, we will call the `send` function
			// e can provide the proofs we created in the previous step.
			// If we provide too many proofs, they will be returned by the `keep` array
			// after that,
			// If the amount of the accumulated proofs we provide do not match exactly the amount we want to send,
			// a split will have to be performed.
			// this will burn the current proofs at the mint, and return a fresh set of proofs, matching the amount we want to send
			const { keep, send } = await wallet.send(amount, proofs, { includeFees: true });

			console.log(
				`sending ${send.reduce((a, b) => a + b.amount, 0)} keeping ${keep.reduce(
					(a, b) => a + b.amount,
					0
				)}`
			);
			// first, let's update our store with the new proofs
			proofs = keep;

			sentProofs.push(...send);

			// and now, let's prepare the ecash we want to send as a cashu string
			// For this, we can use the `Token` type
			// In there, we set the mint url, and proof we want to send
			const token: Token = {
				mint: mintUrl,
				proofs: send
			};
			// and finally, we can encode the token as a cashu string
			const cashuString = getEncodedTokenV4(token);

			// we can now send the cashu string to someone, and they can receive the ecash! let's try that next
			console.log(cashuString);

			// let's try to receive the cashu string back to ourselves
			await receiveEcash(cashuString);
		};

		const receiveEcash = async (cashuString: string) => {
			// we can receive a cashu string back with the `receive` method
			// this step is crucial. It will burn the received proofs, and create new ones,
			// making sure the sender cannot try to double spend them.
			const received = await wallet.receive(cashuString);
			console.log('Received proofs:' + received.reduce((acc, proof) => acc + proof.amount, 0));

			// after receiving, let's not forget to add the proofs back to our storage
			proofs.push(...received);

			// After receiving back our ecash, let's try to melt it.
			// Melting ecash means, exchanging it back to the medium it was issued for.
			// in most cases that would be lightning sats
			await meltEcash();
		};

        const meltEcash = async () => {
			// Similar to the minting process, we need to create a melt quote first.
			// For this, we let the mint know what kind of request we want to be fulfilled.
			// Usually this would be the payment of a lightning invoice.
			const quote = await wallet.createMeltQuote(externalInvoice);

			// After creating the melt quote, we can initiate the melting process.
			const amountToMelt = quote.amount + quote.fee_reserve;

			console.log(`quote amount: ${quote.amount}`);
			console.log(`fee reserve proofs: ${quote.fee_reserve}`);
			console.log(`Total quote amount: ${amountToMelt}`);

			// in order to get the correct amount of proofs for the melt request, we can use the `send` function we used before
			const { keep, send } = await wallet.send(amountToMelt, proofs, { includeFees: true });

			// once again, we update the proofs we have to keep.
			proofs = keep;

			sentProofs.push(...send);

			// and initiate the melting process with the prepared proofs.
			const { change } = await wallet.meltProofs(quote, send);

			//in case we overpaid for lightning fees, the mint will return the owed amount in ecash
			proofs.push(...change);

			if (quote.error) {
				console.error(quote.error, quote.code, quote.detail);
				return;
			}

			// After giving the mint some time to fullfil the melt request,
			// we can check on the status
			setTimeout(async () => await checkMeltQuote(quote), 1000);

			const checkMeltQuote = async (q: MeltQuoteResponse) => {
				// we can check on the status of the quote.
				const quote = await wallet.checkMeltQuote(q.quote);

				if (quote.error) {
					console.error(quote.error, quote.code, quote.detail);
					return;
				}
				if (quote.state === MeltQuoteState.PAID) {
					// if the request has succeeded, we should receive the preimage for the paid invoice.
					console.log(
						'success! here is the payment preimage (if its null, the mints lightning backend did not forward the preimage): ',
						quote.payment_preimage
					);

					console.log(`Ecash left: ${sumProofs(proofs)}`);
					console.log(`Spent ecash notes: ${sumProofs(sentProofs)}`);

					// +++++++++++++++++++ THE END +++++++++++++++++++
					// There are more advanced features that were not touched on in this example.
					// Take a look at the documentation to learn about features like seed recovery, locking ecash to pubkeys, etc.
				} else {
					// if the request has not succeeded, we will ask again
					setTimeout(async () => await checkMeltQuote(quote), 1000);
				}
			};
		};
