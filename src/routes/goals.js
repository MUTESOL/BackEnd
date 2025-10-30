const express = require("express");
const router = express.Router();
const blockchainService = require("../services/blockchain");
const { buildCreateGoalTx, CURRENCY_IDS } = require("../utils/transactions");

/**
 * POST /api/goals/create
 * Create a new savings goal
 */
router.post("/create", async (req, res) => {
  try {
    const {
      walletAddress,
      name,
      targetAmount,
      mode, // "lite" or "pro"
      riskTier, // "low", "medium", "high" (required for pro mode)
      currencyId, // 0 for USDC, 1 for IDRX
      deadline, // Unix timestamp
    } = req.body;

    // Validation
    if (!walletAddress || !name || !targetAmount || !mode || currencyId === undefined || !deadline) {
      return res.status(400).json({
        error: "Missing required fields",
        message: "walletAddress, name, targetAmount, mode, currencyId, and deadline are required",
      });
    }

    if (mode === "pro" && !riskTier) {
      return res.status(400).json({
        error: "Missing risk tier",
        message: "riskTier is required for Pro mode (low, medium, or high)",
      });
    }

    if (!["lite", "pro"].includes(mode)) {
      return res.status(400).json({
        error: "Invalid mode",
        message: "mode must be either 'lite' or 'pro'",
      });
    }

    if (mode === "pro" && !["low", "medium", "high"].includes(riskTier)) {
      return res.status(400).json({
        error: "Invalid risk tier",
        message: "riskTier must be 'low', 'medium', or 'high' for Pro mode",
      });
    }

    // Check if user exists
    const userAccount = await blockchainService.getUserAccount(walletAddress);
    if (!userAccount) {
      return res.status(400).json({
        error: "User not initialized",
        message: "Please initialize your user account first at POST /api/users/initialize",
      });
    }

    // Check if user has reached max goals (5)
    if (userAccount.activeGoals >= 5) {
      return res.status(400).json({
        error: "Maximum goals reached",
        message: "You can have a maximum of 5 active goals. Please complete or withdraw from an existing goal.",
      });
    }

    // Validate deadline (must be at least 90 days in the future)
    const now = Math.floor(Date.now() / 1000);
    const minDeadline = now + (90 * 24 * 60 * 60); // 90 days
    if (deadline < minDeadline) {
      return res.status(400).json({
        error: "Invalid deadline",
        message: "Deadline must be at least 90 days in the future",
      });
    }

    // Build the transaction
    const result = await buildCreateGoalTx({
      userWallet: walletAddress,
      name,
      targetAmount,
      mode,
      riskTier,
      currencyId,
      deadline,
    });

    // Serialize transaction for client to sign
    const serializedTx = result.transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });

    // Get currency config for APY info
    const currencyConfig = await blockchainService.getCurrencyConfig(currencyId);
    const currencyName = currencyId === CURRENCY_IDS.USDC ? "USDC" : "IDRX";

    // Determine APY based on mode and risk tier
    let apy;
    if (mode === "lite") {
      apy = currencyConfig.liteApy / 100; // Convert basis points to percentage
    } else {
      apy = riskTier === "low" ? currencyConfig.proLowRiskApy / 100 :
            riskTier === "medium" ? currencyConfig.proMediumRiskApy / 100 :
            currencyConfig.proHighRiskApy / 100;
    }

    res.json({
      success: true,
      message: "Goal creation transaction built successfully",
      transaction: serializedTx.toString("base64"),
      goalAccount: result.goalAccount,
      goalIndex: result.goalIndex,
      goalDetails: {
        name,
        targetAmount,
        mode,
        riskTier: mode === "pro" ? riskTier : null,
        currency: currencyName,
        apy: `${apy}%`,
        deadline: new Date(deadline * 1000).toISOString(),
      },
      instructions: [
        "Send this transaction to your wallet for signing",
        "Once confirmed, your savings goal will be created",
        `You will earn ${apy}% APY on deposits to this goal`,
      ],
    });
  } catch (error) {
    console.error("Error creating goal:", error);
    res.status(500).json({
      error: "Internal server error",
      message: error.message,
    });
  }
});

/**
 * GET /api/goals/user/:address
 * Get all goals for a user
 */
router.get("/user/:address", async (req, res) => {
  try {
    const { address } = req.params;
    const { status } = req.query; // Optional filter: "active", "completed", "withdrawn"

    const goals = await blockchainService.getUserGoals(address);

    // Filter by status if provided
    let filteredGoals = goals;
    if (status) {
      filteredGoals = goals.filter(g => g.status === status);
    }

    // Enrich goals with calculated data
    const enrichedGoals = filteredGoals.map(goal => {
      const totalValue = parseInt(goal.currentAmount) + parseInt(goal.accruedInterest);
      const progress = goal.targetAmount > 0
        ? (parseInt(goal.currentAmount) / parseInt(goal.targetAmount)) * 100
        : 0;
      const currencyName = goal.currencyId === CURRENCY_IDS.USDC ? "USDC" : "IDRX";

      return {
        ...goal,
        totalValue: totalValue.toString(),
        progress: progress.toFixed(2) + "%",
        currency: currencyName,
        createdDate: new Date(parseInt(goal.createdAt) * 1000).toISOString(),
        deadlineDate: new Date(parseInt(goal.deadline) * 1000).toISOString(),
        lastDepositDate: goal.lastDepositDay > 0
          ? new Date(parseInt(goal.lastDepositDay) * 1000).toISOString()
          : null,
      };
    });

    res.json({
      success: true,
      count: enrichedGoals.length,
      goals: enrichedGoals,
    });
  } catch (error) {
    console.error("Error fetching goals:", error);
    res.status(500).json({
      error: "Internal server error",
      message: error.message,
    });
  }
});

/**
 * GET /api/goals/:address/:goalIndex
 * Get a specific goal by index
 */
router.get("/:address/:goalIndex", async (req, res) => {
  try {
    const { address, goalIndex } = req.params;

    const goal = await blockchainService.getGoalAccount(address, parseInt(goalIndex));

    if (!goal) {
      return res.status(404).json({
        error: "Goal not found",
        message: `Goal with index ${goalIndex} not found for this user`,
      });
    }

    // Enrich with calculated data
    const totalValue = parseInt(goal.currentAmount) + parseInt(goal.accruedInterest);
    const progress = goal.targetAmount > 0
      ? (parseInt(goal.currentAmount) / parseInt(goal.targetAmount)) * 100
      : 0;
    const currencyName = goal.currencyId === CURRENCY_IDS.USDC ? "USDC" : "IDRX";

    // Check if deadline has passed
    const now = Math.floor(Date.now() / 1000);
    const isExpired = parseInt(goal.deadline) < now;
    const canWithdrawWithoutPenalty = isExpired;

    res.json({
      success: true,
      goal: {
        ...goal,
        totalValue: totalValue.toString(),
        progress: progress.toFixed(2) + "%",
        currency: currencyName,
        createdDate: new Date(parseInt(goal.createdAt) * 1000).toISOString(),
        deadlineDate: new Date(parseInt(goal.deadline) * 1000).toISOString(),
        lastDepositDate: goal.lastDepositDay > 0
          ? new Date(parseInt(goal.lastDepositDay) * 1000).toISOString()
          : null,
        isExpired,
        canWithdrawWithoutPenalty,
      },
    });
  } catch (error) {
    console.error("Error fetching goal:", error);
    res.status(500).json({
      error: "Internal server error",
      message: error.message,
    });
  }
});

/**
 * GET /api/goals/currencies
 * Get all available currencies and their configurations
 */
router.get("/currencies/all", async (req, res) => {
  try {
    const currencies = await blockchainService.getAllCurrencies();

    const enrichedCurrencies = currencies.map(currency => {
      const currencyName = currency.currencyId === CURRENCY_IDS.USDC ? "USDC" : "IDRX";
      return {
        ...currency,
        name: currencyName,
        liteApyPercent: (currency.liteApy / 100) + "%",
        proLowRiskApyPercent: (currency.proLowRiskApy / 100) + "%",
        proMediumRiskApyPercent: (currency.proMediumRiskApy / 100) + "%",
        proHighRiskApyPercent: (currency.proHighRiskApy / 100) + "%",
      };
    });

    res.json({
      success: true,
      currencies: enrichedCurrencies,
    });
  } catch (error) {
    console.error("Error fetching currencies:", error);
    res.status(500).json({
      error: "Internal server error",
      message: error.message,
    });
  }
});

module.exports = router;
