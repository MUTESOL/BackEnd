const express = require("express");
const router = express.Router();
const blockchainService = require("../services/blockchain");
const { validateAmount, validateCurrencyId } = require("../utils/validation");
const {
  buildDepositTx,
  buildWithdrawCompletedTx,
  buildWithdrawEarlyTx,
  buildClaimFaucetTx,
  CURRENCY_IDS,
} = require("../utils/transactions");

/**
 * POST /api/transactions/deposit
 * Build deposit transaction - MINTS sUSDC or sIDRX tokens
 * This creates interest-bearing tokens in a 1:1 ratio with the base tokens
 */
router.post("/deposit", async (req, res) => {
  try {
    const {
      walletAddress,
      goalIndex,
      amount,
      currencyId, // 0 for USDC, 1 for IDRX
    } = req.body;

    // Validation
    if (!walletAddress || goalIndex === undefined || !amount || currencyId === undefined) {
      return res.status(400).json({
        error: "Missing required fields",
        message: "walletAddress, goalIndex, amount, and currencyId are required",
      });
    }

    // Validate amount
    const amountValidation = validateAmount(amount);
    if (!amountValidation.valid) {
      return res.status(400).json({
        error: "Invalid amount",
        message: amountValidation.error,
      });
    }

    // Validate currency ID
    const currencyValidation = validateCurrencyId(currencyId);
    if (!currencyValidation.valid) {
      return res.status(400).json({
        error: "Invalid currency",
        message: currencyValidation.error,
      });
    }

    // Check if goal exists
    const goal = await blockchainService.getGoalAccount(walletAddress, goalIndex);
    if (!goal) {
      return res.status(404).json({
        error: "Goal not found",
        message: `Goal with index ${goalIndex} not found`,
      });
    }

    // Check if goal is active
    if (goal.status !== "active") {
      return res.status(400).json({
        error: "Goal not active",
        message: `Cannot deposit to a ${goal.status} goal`,
      });
    }

    // Check if goal's currency matches
    if (goal.currencyId !== currencyId) {
      return res.status(400).json({
        error: "Currency mismatch",
        message: `This goal uses currency ID ${goal.currencyId}, not ${currencyId}`,
      });
    }

    // Build the transaction
    const result = await buildDepositTx({
      userWallet: walletAddress,
      goalIndex,
      amount,
      currencyId,
    });

    // Serialize transaction
    const serializedTx = result.transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });

    const currencyName = currencyId === CURRENCY_IDS.USDC ? "USDC" : "IDRX";
    const newTotal = parseInt(goal.currentAmount) + parseInt(amount);

    res.json({
      success: true,
      message: "Deposit transaction built successfully",
      operation: "MINT",
      transaction: serializedTx.toString("base64"),
      details: {
        goalName: goal.name,
        depositAmount: amount,
        currency: currencyName,
        currentAmount: goal.currentAmount,
        newTotal: newTotal.toString(),
        targetAmount: goal.targetAmount,
        savingsTokenMint: result.savingsTokenMint,
        savingsTokenAccount: result.userSavingsTokenAccount,
      },
      instructions: [
        "Send this transaction to your wallet for signing",
        `This will deposit ${amount} ${currencyName} to your goal`,
        `You will receive ${amount} s${currencyName} (interest-bearing tokens)`,
        "Streak bonuses and first-time bonuses will be automatically applied",
      ],
    });
  } catch (error) {
    console.error("Error building deposit transaction:", error);
    res.status(500).json({
      error: "Internal server error",
      message: error.message,
    });
  }
});

/**
 * POST /api/transactions/withdraw
 * Build withdrawal transaction - BURNS sUSDC or sIDRX tokens
 * Returns base tokens + interest
 */
router.post("/withdraw", async (req, res) => {
  try {
    const {
      walletAddress,
      goalIndex,
      early, // boolean - whether this is an early withdrawal
    } = req.body;

    // Validation
    if (!walletAddress || goalIndex === undefined) {
      return res.status(400).json({
        error: "Missing required fields",
        message: "walletAddress and goalIndex are required",
      });
    }

    // Check if goal exists
    const goal = await blockchainService.getGoalAccount(walletAddress, goalIndex);
    if (!goal) {
      return res.status(404).json({
        error: "Goal not found",
        message: `Goal with index ${goalIndex} not found`,
      });
    }

    // Check if goal has funds
    if (parseInt(goal.currentAmount) === 0) {
      return res.status(400).json({
        error: "No funds to withdraw",
        message: "This goal has no funds to withdraw",
      });
    }

    // Determine if withdrawal is early
    const now = Math.floor(Date.now() / 1000);
    const isEarly = parseInt(goal.deadline) > now;

    // Build appropriate transaction
    let result;
    if (isEarly || early) {
      // Early withdrawal with 2% penalty
      result = await buildWithdrawEarlyTx({
        userWallet: walletAddress,
        goalIndex,
      });
    } else {
      // Completed withdrawal (no penalty)
      result = await buildWithdrawCompletedTx({
        userWallet: walletAddress,
        goalIndex,
      });
    }

    // Serialize transaction
    const serializedTx = result.transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });

    const currencyName = goal.currencyId === CURRENCY_IDS.USDC ? "USDC" : "IDRX";
    const savingsTokenName = `s${currencyName}`;

    res.json({
      success: true,
      message: "Withdrawal transaction built successfully",
      operation: "BURN",
      transaction: serializedTx.toString("base64"),
      withdrawalType: isEarly || early ? "early" : "completed",
      details: {
        goalName: goal.name,
        currency: currencyName,
        savingsTokenToBurn: goal.currentAmount,
        principal: result.principal,
        interest: result.interest,
        totalBeforePenalty: result.totalBeforePenalty || result.totalAmount,
        penalty: result.penalty || "0",
        finalAmount: result.totalAfterPenalty || result.totalAmount,
      },
      instructions: [
        "Send this transaction to your wallet for signing",
        `This will burn your ${savingsTokenName} tokens`,
        `You will receive ${result.totalAfterPenalty || result.totalAmount} ${currencyName}`,
        isEarly || early
          ? "⚠️ Early withdrawal: 2% penalty applied (50% to treasury, 50% to reward pool)"
          : "✅ Withdrawal after deadline: No penalty",
      ],
    });
  } catch (error) {
    console.error("Error building withdrawal transaction:", error);
    res.status(500).json({
      error: "Internal server error",
      message: error.message,
    });
  }
});

/**
 * POST /api/transactions/faucet/claim
 * Claim test tokens from the faucet (Devnet only)
 */
router.post("/faucet/claim", async (req, res) => {
  try {
    const {
      walletAddress,
      tokenMint, // USDC or IDRX mint address
      currencyId, // 0 for USDC, 1 for IDRX (alternative to tokenMint)
    } = req.body;

    if (!walletAddress) {
      return res.status(400).json({
        error: "Missing required field",
        message: "walletAddress is required",
      });
    }

    // Determine token mint
    let mintAddress = tokenMint;
    if (!mintAddress && currencyId !== undefined) {
      const currencyConfig = await blockchainService.getCurrencyConfig(currencyId);
      mintAddress = currencyConfig.baseTokenMint;
    }

    if (!mintAddress) {
      return res.status(400).json({
        error: "Missing token information",
        message: "Either tokenMint or currencyId is required",
      });
    }

    // Check if faucet is enabled
    if (process.env.FAUCET_ENABLED !== "true") {
      return res.status(403).json({
        error: "Faucet disabled",
        message: "The faucet is only available on development/testnet environments",
      });
    }

    // Check user's faucet account for rate limiting
    const userFaucetAccount = await blockchainService.getUserFaucetAccount(walletAddress);
    if (userFaucetAccount) {
      // Check cooldown
      const now = Math.floor(Date.now() / 1000);
      const cooldownPeriod = 3600; // 1 hour
      const timeSinceLastClaim = now - parseInt(userFaucetAccount.lastClaimTime);

      if (timeSinceLastClaim < cooldownPeriod) {
        const remainingTime = cooldownPeriod - timeSinceLastClaim;
        const minutes = Math.floor(remainingTime / 60);
        return res.status(429).json({
          error: "Cooldown active",
          message: `Please wait ${minutes} minutes before claiming again`,
          remainingSeconds: remainingTime,
        });
      }

      // Check daily limit
      if (userFaucetAccount.claimsToday >= 10) {
        return res.status(429).json({
          error: "Daily limit reached",
          message: "Maximum 10 claims per day. Please try again tomorrow.",
        });
      }
    }

    // Build transaction
    const result = await buildClaimFaucetTx({
      userWallet: walletAddress,
      tokenMint: mintAddress,
    });

    // Serialize transaction
    const serializedTx = result.transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });

    // Get faucet config for amount info
    const faucetConfig = await blockchainService.getFaucetConfig();
    const currencyName = currencyId === CURRENCY_IDS.USDC ? "USDC" : "IDRX";

    res.json({
      success: true,
      message: "Faucet claim transaction built successfully",
      transaction: serializedTx.toString("base64"),
      details: {
        currency: currencyName,
        amount: faucetConfig ? faucetConfig.amountPerClaim : "N/A",
        userTokenAccount: result.userTokenAccount,
        cooldownPeriod: "1 hour",
        dailyLimit: "10 claims",
      },
      instructions: [
        "Send this transaction to your wallet for signing",
        "You will receive test tokens for development purposes",
        "These tokens have no real value and are for testing only",
      ],
    });
  } catch (error) {
    console.error("Error building faucet claim transaction:", error);
    res.status(500).json({
      error: "Internal server error",
      message: error.message,
    });
  }
});

/**
 * GET /api/transactions/user/:address/history
 * Get transaction history for a user
 * Note: This fetches on-chain goal data. For complete transaction history,
 * you would need to parse transaction logs or use a database to cache transactions
 */
router.get("/user/:address/history", async (req, res) => {
  try {
    const { address } = req.params;

    const goals = await blockchainService.getUserGoals(address);

    // Build a simple history from goals
    const history = goals.map(goal => {
      const currencyName = goal.currencyId === CURRENCY_IDS.USDC ? "USDC" : "IDRX";
      return {
        goalIndex: goal.goalIndex,
        goalName: goal.name,
        currency: currencyName,
        totalDeposits: goal.totalDeposits,
        currentAmount: goal.currentAmount,
        accruedInterest: goal.accruedInterest,
        status: goal.status,
        createdAt: new Date(parseInt(goal.createdAt) * 1000).toISOString(),
        lastDepositDay: goal.lastDepositDay > 0
          ? new Date(parseInt(goal.lastDepositDay) * 1000).toISOString()
          : null,
      };
    });

    res.json({
      success: true,
      count: history.length,
      history,
      note: "For detailed transaction logs, consider implementing a database to cache individual transactions",
    });
  } catch (error) {
    console.error("Error fetching transaction history:", error);
    res.status(500).json({
      error: "Internal server error",
      message: error.message,
    });
  }
});

module.exports = router;
