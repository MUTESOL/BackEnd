const express = require("express");
const { Connection, clusterApiUrl, PublicKey } = require("@solana/web3.js");

const app = express();
app.use(express.json());

// Connect to Solana Devnet
const connection = new Connection(clusterApiUrl("devnet"), "confirmed");

// Example: Get balance of a wallet
app.get("/balance/:address", async (req, res) => {
  try {
    const publicKey = new PublicKey(req.params.address);
    const balanceLamports = await connection.getBalance(publicKey);
    const balanceSOL = balanceLamports / 1e9;
    res.json({ address: req.params.address, balance: `${balanceSOL} SOL` });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

const PORT = 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
