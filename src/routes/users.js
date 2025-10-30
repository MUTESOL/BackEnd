const express = require("express");
const router = express.Router();
const blockchainService = require("../services/blockchain");
const { buildInitializeUserTx } = require("../utils/transactions");

/**
 * POST /api/users/initialize
 * Initialize a new user account on-chain
 */
router.post("/initialize", async (req, res) => {
  try {
    const { walletAddress } = req.body;

    if (!walletAddress) {
      return res.status(400).json({
        error: "Missing required field",
        message: "walletAddress is required",
      });
    }

    // Check if user already exists
    const existingUser = await blockchainService.getUserAccount(walletAddress);
    if (existingUser) {
      return res.status(400).json({
        error: "User already exists",
        message: "This wallet address is already initialized",
        user: existingUser,
      });
    }

    // Build the transaction
    const { transaction, userAccount } = await buildInitializeUserTx(walletAddress);

    // Serialize transaction for client to sign
    const serializedTx = transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });

    res.json({
      success: true,
      message: "User initialization transaction built successfully",
      transaction: serializedTx.toString("base64"),
      userAccount,
      instructions: [
        "Send this transaction to your wallet for signing",
        "Once signed and confirmed, your user account will be initialized",
      ],
    });
  } catch (error) {
    console.error("Error initializing user:", error);
    res.status(500).json({
      error: "Internal server error",
      message: error.message,
    });
  }
});

/**
 * GET /api/users/:address
 * Get user account information
 */
router.get("/:address", async (req, res) => {
  try {
    const { address } = req.params;

    const userAccount = await blockchainService.getUserAccount(address);

    if (!userAccount) {
      return res.status(404).json({
        error: "User not found",
        message: "This wallet address has not been initialized yet",
      });
    }

    res.json({
      success: true,
      user: userAccount,
    });
  } catch (error) {
    console.error("Error fetching user:", error);
    res.status(500).json({
      error: "Internal server error",
      message: error.message,
    });
  }
});

/**
 * GET /api/users/:address/stats
 * Get comprehensive user statistics including goals
 */
router.get("/:address/stats", async (req, res) => {
  try {
    const { address } = req.params;

    const userAccount = await blockchainService.getUserAccount(address);

    if (!userAccount) {
      return res.status(404).json({
        error: "User not found",
        message: "This wallet address has not been initialized yet",
      });
    }

    // Fetch all user goals
    const goals = await blockchainService.getUserGoals(address);

    // Calculate statistics
    const activeGoals = goals.filter(g => g.status === "active");
    const completedGoals = goals.filter(g => g.status === "completed");
    const totalSaved = goals.reduce((sum, g) => sum + parseInt(g.currentAmount), 0);
    const totalInterestEarned = goals.reduce((sum, g) => sum + parseInt(g.accruedInterest), 0);

    res.json({
      success: true,
      stats: {
        user: userAccount,
        totalGoals: userAccount.totalGoalsCreated,
        activeGoals: activeGoals.length,
        completedGoals: completedGoals.length,
        totalSaved: totalSaved.toString(),
        totalInterestEarned: totalInterestEarned.toString(),
        lifetimeDeposits: userAccount.lifetimeDeposits,
        lifetimeWithdrawals: userAccount.lifetimeWithdrawals,
      },
      goals: {
        active: activeGoals,
        completed: completedGoals,
        all: goals,
      },
    });
  } catch (error) {
    console.error("Error fetching user stats:", error);
    res.status(500).json({
      error: "Internal server error",
      message: error.message,
    });
  }
});

/**
 * GET /api/users/:address/balance
 * Get SOL balance for a wallet (convenience endpoint)
 */
router.get("/:address/balance", async (req, res) => {
  try {
    const { address } = req.params;

    const balance = await blockchainService.getBalance(address);

    res.json({
      success: true,
      address,
      balance: balance,
      unit: "SOL",
    });
  } catch (error) {
    console.error("Error fetching balance:", error);
    res.status(500).json({
      error: "Internal server error",
      message: error.message,
    });
  }
});

module.exports = router;
