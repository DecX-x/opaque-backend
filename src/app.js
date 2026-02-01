import fs from 'node:fs/promises';
import path from 'node:path';
import { IExecDataProtectorDeserializer } from '@iexec/dataprotector-deserializer';
import { ethers } from 'ethers';

const main = async () => {
  const { IEXEC_OUT, IEXEC_APP_DEVELOPER_SECRET, IEXEC_BULK_SLICE_SIZE } = process.env;

  let computedJsonObj = {};

  try {
    // 1. Initialize TEE Wallet
    if (!IEXEC_APP_DEVELOPER_SECRET) {
      throw new Error("App Secret (TEE Private Key) is missing!");
    }
    const teeWallet = new ethers.Wallet(IEXEC_APP_DEVELOPER_SECRET);
    console.log(`TEE Signer Address: ${teeWallet.address}`);

    // 2. Load Orders from Protected Data
    let orders = [];
    const bulkSize = parseInt(IEXEC_BULK_SLICE_SIZE || '0');
    
    if (bulkSize > 0) {
      console.log(`Processing ${bulkSize} protected datasets...`);
      for (let i = 1; i <= bulkSize; i++) {
        try {
          const deserializer = new IExecDataProtectorDeserializer({
            protectedDataPath: path.join(
              process.env.IEXEC_IN,
              process.env[`IEXEC_DATASET_${i}_FILENAME`]
            ),
          });
          
          // Assuming the protected data is a JSON string of the order
          const orderJson = await deserializer.getValue('order', 'string');
          const order = JSON.parse(orderJson);
          orders.push(order);
          console.log(`Loaded Order ${i}: ${order.id} (${order.side})`);
        } catch (e) {
          console.error(`Failed to load dataset ${i}:`, e.message);
        }
      }
    } else {
        console.log("No protected data found. Checking Args for mock orders...");
        // Fallback for testing with args: --args '{"id":"1",...}' '{"id":"2",...}'
        const args = process.argv.slice(2);
        args.forEach(arg => {
            try {
                orders.push(JSON.parse(arg));
            } catch (e) { console.log("Arg is not JSON order:", arg); }
        });
    }

    // 3. Matching Logic (Simple: Match Buy WETH with Sell WETH)
    // Simplified: Just match the first two compatible orders found for demo.
    let trades = [];
    let usedOrders = new Set();

    for (let i = 0; i < orders.length; i++) {
        if (usedOrders.has(i)) continue;
        const maker = orders[i];

        for (let j = i + 1; j < orders.length; j++) {
            if (usedOrders.has(j)) continue;
            const taker = orders[j];

            // Check match compatibility
            // Maker: Sell 2000 USDC for 1 WETH
            // Taker: Buy 1 WETH for 2000 USDC
            // Compatibility:
            // maker.tokenSell == taker.tokenBuy
            // maker.tokenBuy == taker.tokenSell
            
            // For Demo: Assume perfect match if tokens match inverted
            if (maker.tokenSell.toLowerCase() === taker.tokenBuy.toLowerCase() &&
                maker.tokenBuy.toLowerCase() === taker.tokenSell.toLowerCase()) {
                
                // Calculate Trade (Simplified: Take Maker's amount)
                // In real world: Min(maker.amount, taker.amount)
                
                // Construct Trade Object for Smart Contract
                // struct Trade { buyer, seller, tokenBuy, tokenSell, amountBuy, amountSell, nonce }
                // Warning: "Buyer" in struct is the one CALLING the trade? 
                // No, the struct defines: "buyer" receives "tokenBuy" and gives "amountSell" of "tokenSell".
                
                // Let's map Maker to "Buyer" role in the struct for simplicity of the struct Logic
                // Maker wants maker.tokenBuy, gives maker.amountSell
                const trade = {
                    buyer: maker.owner,     // Maker is the "Buyer" in this struct context
                    seller: taker.owner,    // Taker is the "Seller"
                    tokenBuy: maker.tokenBuy,
                    tokenSell: maker.tokenSell,
                    amountBuy: maker.amountBuy,   // Maker receives this
                    amountSell: maker.amountSell, // Maker gives this
                    nonce: Math.floor(Math.random() * 1000000) // Random nonce for demo
                };

                trades.push(trade);
                usedOrders.add(i);
                usedOrders.add(j);
                console.log(`Matched Order ${maker.id} with ${taker.id}`);
                break; // Move to next order
            }
        }
    }

    // 4. Sign Result
    // Payload: Hash of AbiEncoded(Trade[])
    // Solidity: abi.encode(trades)
    
    // Ethers v6: AbiCoder.defaultAbiCoder().encode(...)
    // Struct definition for Ethers
    const TradeTuple = "tuple(address buyer, address seller, address tokenBuy, address tokenSell, uint256 amountBuy, uint256 amountSell, uint256 nonce)";
    
    const encodedTrades = ethers.AbiCoder.defaultAbiCoder().encode(
        [`${TradeTuple}[]`],
        [trades]
    );
    
    const payloadHash = ethers.keccak256(encodedTrades);
    
    // Sign payload
    // Note: signMessage automatically adds "\x19Ethereum Signed Message:\n32" prefix, 
    // which corresponds to ECDSA.recover(toEthSignedMessageHash(hash)) in Solidity. Perfect.
    const signature = await teeWallet.signMessage(ethers.getBytes(payloadHash));

    console.log(`Generated ${trades.length} trades.`);
    console.log(`Signature: ${signature}`);

    // 5. Write Output
    const result = {
        trades: trades,
        signature: signature,
        signer: teeWallet.address
    };

    await fs.writeFile(`${IEXEC_OUT}/result.json`, JSON.stringify(result));
    
    // Also write computed.json
    computedJsonObj = {
      'deterministic-output-path': `${IEXEC_OUT}/result.json`,
    };

  } catch (e) {
    console.log(e);
    computedJsonObj = {
      'deterministic-output-path': `${IEXEC_OUT}/error.txt`,
      'error-message': e.message,
    };
    await fs.writeFile(`${IEXEC_OUT}/error.txt`, e.message);
  } finally {
    await fs.writeFile(
      `${IEXEC_OUT}/computed.json`,
      JSON.stringify(computedJsonObj)
    );
  }
};

main();
