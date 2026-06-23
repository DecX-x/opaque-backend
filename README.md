# iExec TEE Orderbook Matcher (Opaque Backend)

This project is a Decentralized Confidential Computing serverless application running on the iExec platform. It leverages a Trusted Execution Environment (TEE) to confidentially process trading orders, match them, and cryptographically sign the resulting trades.

## Overview

The `Opaque Backend` acts as a secure, off-chain order matching engine. By running inside a TEE (like Intel SGX), the application guarantees that order contents (e.g., protected datasets) remain confidential and that the matching execution cannot be tampered with.

The application performs the following main tasks:
1. **Initializes a TEE Wallet**: Uses an app developer secret to instantiate an Ethereum wallet that will sign the matched trades.
2. **Loads Orders**: Reads orders from iExec protected datasets (using `@iexec/dataprotector-deserializer`) or from command-line arguments for mock testing.
3. **Matches Orders**: Implements a matching algorithm to pair compatible maker and taker orders (e.g., swapping WETH for USDC).
4. **Signs Results**: Encodes the matched trades into an Ethereum ABI format and signs the hash using the TEE wallet.
5. **Outputs Results**: Writes the matched trades, the TEE signature, and the signer's address to `result.json`.

## Prerequisites

- Node.js environment
- `iapp` CLI installed locally
- Docker installed locally
- An Ethereum wallet
- An iExec account

## Application Inputs

### 1. Application Secret (App Developer Secret)
The application requires an Ethereum private key to act as the TEE signer.
- **Environment Variable**: `IEXEC_APP_DEVELOPER_SECRET`
- This is injected securely at runtime by the iExec TEE infrastructure.

### 2. Protected Datasets (Orders)
Users' orders are provided as protected datasets.
- **`IEXEC_BULK_SLICE_SIZE`**: The number of protected datasets to process.
- **`IEXEC_DATASET_{i}_FILENAME`**: The filename for each dataset.
- Order format (JSON): `{ "id": "1", "owner": "0x...", "tokenBuy": "0x...", "tokenSell": "0x...", "amountBuy": "...", "amountSell": "..." }`

### 3. Mock Orders (Testing)
If no protected datasets are provided, the app will fall back to reading JSON string arguments passed via `process.argv`.

## Application Outputs

The application produces standard iExec output files in the `IEXEC_OUT` directory:

1. **`result.json`** (Deterministic Output):
   - `trades`: Array of matched trade objects.
   - `signature`: ECDSA signature of the ABI-encoded trades.
   - `signer`: The public address of the TEE wallet.
2. **`computed.json`**: Points to `result.json` as the deterministic output path.
3. **`error.txt`**: Created only if an execution error occurs.

## Trade Struct (Smart Contract Integration)

The application constructs and signs a `Trade` tuple compatible with standard Solidity contracts:
```solidity
struct Trade {
    address buyer;
    address seller;
    address tokenBuy;
    address tokenSell;
    uint256 amountBuy;
    uint256 amountSell;
    uint256 nonce;
}
```

## Running the Application Locally

1. **Install dependencies**:
   ```sh
   npm install
   ```

2. **Run via iApp CLI**:
   ```sh
   iapp test --args '{"id":"1","owner":"0x123","tokenBuy":"WETH","tokenSell":"USDC","amountBuy":"1","amountSell":"2000"}' '{"id":"2","owner":"0x456","tokenBuy":"USDC","tokenSell":"WETH","amountBuy":"2000","amountSell":"1"}'
   ```
   *Note: `iapp test` will prompt you to provide the App Developer Secret (`IEXEC_APP_DEVELOPER_SECRET`).*

## Deployment

Deploy this application to the iExec network to run it within an SGX enclave:

```sh
iapp deploy
```
*The app secret is provisioned at deployment time.*
