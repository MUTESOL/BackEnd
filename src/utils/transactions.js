const { PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY } = require("@solana/web3.js");
const { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } = require("@solana/spl-token");
const { BN } = require("@coral-xyz/anchor");
const blockchainService = require("../services/blockchain");

/**
 * Transaction Builder Utilities
 * Builds transaction instructions for interacting with the StackSave smart contract
 */

/**
 * Currency IDs
 */
const CURRENCY_IDS = {
  USDC: 0,
  IDRX: 1,
};

/**
 * Build initialize user transaction
 * Creates the user account PDA on-chain
 */
async function buildInitializeUserTx(userWallet) {
  try {
    const program = blockchainService.getProgram();
    const connection = blockchainService.getConnection();
    const userPubkey = new PublicKey(userWallet);
    const userAccountPDA = blockchainService.getUserAccountPDA(userPubkey);

    const tx = await program.methods
      .initializeUser()
      .accounts({
        user: userPubkey,
        userAccount: userAccountPDA,
        systemProgram: SystemProgram.programId,
      })
      .transaction();

    // Fetch recent blockhash and set transaction properties
    const { blockhash } = await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = userPubkey;

    return {
      transaction: tx,
      userAccount: userAccountPDA.toString(),
    };
  } catch (error) {
    console.error("Error building initialize user transaction:", error);
    throw error;
  }
}

/**
 * Build create goal transaction
 * Creates a new savings goal with NFT representation
 */
async function buildCreateGoalTx(params) {
  try {
    const {
      userWallet,
      name,
      targetAmount,
      mode, // "lite" or "pro"
      riskTier, // "low", "medium", "high" (required for pro mode)
      currencyId, // 0 for USDC, 1 for IDRX
      deadline, // Unix timestamp
    } = params;

    const program = blockchainService.getProgram();
    const userPubkey = new PublicKey(userWallet);

    // Get user account to determine goal index
    const userAccount = await blockchainService.getUserAccount(userWallet);
    if (!userAccount) {
      throw new Error("User account not initialized. Please initialize user first.");
    }

    const goalIndex = userAccount.totalGoalsCreated;
    const userAccountPDA = blockchainService.getUserAccountPDA(userPubkey);
    const goalAccountPDA = blockchainService.getGoalAccountPDA(userPubkey, goalIndex);
    const currencyConfigPDA = blockchainService.getCurrencyConfigPDA(currencyId);

    // NFT mint keypair (placeholder for now, will be generated on-chain)
    // In the actual implementation, this would be handled by Metaplex
    const nftMintPDA = PublicKey.default;

    // Convert mode to program format
    const modeEnum = mode === "lite" ? { lite: {} } : { pro: {} };

    // Convert risk tier to program format (required for pro mode)
    let riskTierEnum = null;
    if (mode === "pro") {
      if (!riskTier) {
        throw new Error("Risk tier is required for Pro mode");
      }
      riskTierEnum =
        riskTier === "low" ? { low: {} } :
        riskTier === "medium" ? { medium: {} } :
        { high: {} };
    }

    const tx = await program.methods
      .createGoal(
        name,
        new BN(targetAmount),
        modeEnum,
        riskTierEnum,
        currencyId,
        new BN(deadline)
      )
      .accounts({
        user: userPubkey,
        userAccount: userAccountPDA,
        goalAccount: goalAccountPDA,
        currencyConfig: currencyConfigPDA,
        nftMint: nftMintPDA,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .transaction();

    // Fetch recent blockhash and set transaction properties
    const connection = blockchainService.getConnection();
    const { blockhash } = await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = userPubkey;

    return {
      transaction: tx,
      goalAccount: goalAccountPDA.toString(),
      goalIndex,
    };
  } catch (error) {
    console.error("Error building create goal transaction:", error);
    throw error;
  }
}

/**
 * Build deposit transaction - MINTS sUSDC/sIDRX tokens
 * This is the MINT operation that creates interest-bearing tokens
 */
async function buildDepositTx(params) {
  try {
    const {
      userWallet,
      goalIndex,
      amount,
      currencyId, // 0 for USDC, 1 for IDRX
    } = params;

    const program = blockchainService.getProgram();
    const userPubkey = new PublicKey(userWallet);

    // Get PDAs
    const userAccountPDA = blockchainService.getUserAccountPDA(userPubkey);
    const goalAccountPDA = blockchainService.getGoalAccountPDA(userPubkey, goalIndex);
    const currencyConfigPDA = blockchainService.getCurrencyConfigPDA(currencyId);
    const savingsMintPDA = blockchainService.getSavingsMintPDA(currencyId);

    // Get currency config to get base token mint
    const currencyConfig = await blockchainService.getCurrencyConfig(currencyId);
    const baseTokenMint = new PublicKey(currencyConfig.baseTokenMint);

    // Get token accounts
    const userBaseTokenAccount = getAssociatedTokenAddressSync(
      baseTokenMint,
      userPubkey
    );
    const userSavingsTokenAccount = getAssociatedTokenAddressSync(
      savingsMintPDA,
      userPubkey
    );

    const tx = await program.methods
      .deposit(new BN(amount))
      .accounts({
        user: userPubkey,
        userAccount: userAccountPDA,
        goalAccount: goalAccountPDA,
        currencyConfig: currencyConfigPDA,
        baseTokenMint: baseTokenMint,
        savingsTokenMint: savingsMintPDA,
        userBaseTokenAccount: userBaseTokenAccount,
        userSavingsTokenAccount: userSavingsTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .transaction();

    // Fetch recent blockhash and set transaction properties
    const connection = blockchainService.getConnection();
    const { blockhash } = await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = userPubkey;

    return {
      transaction: tx,
      savingsTokenMint: savingsMintPDA.toString(),
      userSavingsTokenAccount: userSavingsTokenAccount.toString(),
      message: `Deposit will mint ${amount} sTokens (interest-bearing)`,
    };
  } catch (error) {
    console.error("Error building deposit transaction:", error);
    throw error;
  }
}

/**
 * Build withdraw completed transaction - BURNS sUSDC/sIDRX tokens (no penalty)
 * This is the BURN operation for goals that reached their deadline
 */
async function buildWithdrawCompletedTx(params) {
  try {
    const {
      userWallet,
      goalIndex,
    } = params;

    const program = blockchainService.getProgram();
    const userPubkey = new PublicKey(userWallet);

    // Get goal to determine currency
    const goal = await blockchainService.getGoalAccount(userWallet, goalIndex);
    if (!goal) {
      throw new Error("Goal not found");
    }

    const currencyId = goal.currencyId;

    // Get PDAs
    const userAccountPDA = blockchainService.getUserAccountPDA(userPubkey);
    const goalAccountPDA = blockchainService.getGoalAccountPDA(userPubkey, goalIndex);
    const globalStatePDA = blockchainService.getGlobalStatePDA();
    const currencyConfigPDA = blockchainService.getCurrencyConfigPDA(currencyId);
    const savingsMintPDA = blockchainService.getSavingsMintPDA(currencyId);

    // Get currency config to get base token mint
    const currencyConfig = await blockchainService.getCurrencyConfig(currencyId);
    const baseTokenMint = new PublicKey(currencyConfig.baseTokenMint);

    // Get global state for treasury
    const globalState = await blockchainService.getGlobalState();
    const treasury = new PublicKey(globalState.treasury);

    // Get token accounts
    const userBaseTokenAccount = getAssociatedTokenAddressSync(
      baseTokenMint,
      userPubkey
    );
    const userSavingsTokenAccount = getAssociatedTokenAddressSync(
      savingsMintPDA,
      userPubkey
    );
    const treasuryBaseTokenAccount = getAssociatedTokenAddressSync(
      baseTokenMint,
      treasury
    );

    const tx = await program.methods
      .withdrawCompleted()
      .accounts({
        user: userPubkey,
        userAccount: userAccountPDA,
        goalAccount: goalAccountPDA,
        globalState: globalStatePDA,
        currencyConfig: currencyConfigPDA,
        baseTokenMint: baseTokenMint,
        savingsTokenMint: savingsMintPDA,
        userBaseTokenAccount: userBaseTokenAccount,
        userSavingsTokenAccount: userSavingsTokenAccount,
        treasuryBaseTokenAccount: treasuryBaseTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .transaction();

    // Fetch recent blockhash and set transaction properties
    const connection = blockchainService.getConnection();
    const { blockhash } = await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = userPubkey;

    const totalAmount = parseInt(goal.currentAmount) + parseInt(goal.accruedInterest);

    return {
      transaction: tx,
      message: `Withdrawal will burn sTokens and return ${totalAmount} tokens (principal + interest, no penalty)`,
      principal: goal.currentAmount,
      interest: goal.accruedInterest,
      totalAmount: totalAmount.toString(),
    };
  } catch (error) {
    console.error("Error building withdraw completed transaction:", error);
    throw error;
  }
}

/**
 * Build withdraw early transaction - BURNS sUSDC/sIDRX tokens (with 2% penalty)
 * This is the BURN operation for early withdrawals before deadline
 */
async function buildWithdrawEarlyTx(params) {
  try {
    const {
      userWallet,
      goalIndex,
    } = params;

    const program = blockchainService.getProgram();
    const userPubkey = new PublicKey(userWallet);

    // Get goal to determine currency
    const goal = await blockchainService.getGoalAccount(userWallet, goalIndex);
    if (!goal) {
      throw new Error("Goal not found");
    }

    const currencyId = goal.currencyId;

    // Get PDAs
    const userAccountPDA = blockchainService.getUserAccountPDA(userPubkey);
    const goalAccountPDA = blockchainService.getGoalAccountPDA(userPubkey, goalIndex);
    const globalStatePDA = blockchainService.getGlobalStatePDA();
    const currencyConfigPDA = blockchainService.getCurrencyConfigPDA(currencyId);
    const savingsMintPDA = blockchainService.getSavingsMintPDA(currencyId);

    // Get currency config to get base token mint
    const currencyConfig = await blockchainService.getCurrencyConfig(currencyId);
    const baseTokenMint = new PublicKey(currencyConfig.baseTokenMint);

    // Get global state for treasury and reward pool
    const globalState = await blockchainService.getGlobalState();
    const treasury = new PublicKey(globalState.treasury);
    const rewardPool = new PublicKey(globalState.rewardPool);

    // Get token accounts
    const userBaseTokenAccount = getAssociatedTokenAddressSync(
      baseTokenMint,
      userPubkey
    );
    const userSavingsTokenAccount = getAssociatedTokenAddressSync(
      savingsMintPDA,
      userPubkey
    );
    const treasuryBaseTokenAccount = getAssociatedTokenAddressSync(
      baseTokenMint,
      treasury
    );
    const rewardPoolBaseTokenAccount = getAssociatedTokenAddressSync(
      baseTokenMint,
      rewardPool
    );

    const tx = await program.methods
      .withdrawEarly()
      .accounts({
        user: userPubkey,
        userAccount: userAccountPDA,
        goalAccount: goalAccountPDA,
        globalState: globalStatePDA,
        currencyConfig: currencyConfigPDA,
        baseTokenMint: baseTokenMint,
        savingsTokenMint: savingsMintPDA,
        userBaseTokenAccount: userBaseTokenAccount,
        userSavingsTokenAccount: userSavingsTokenAccount,
        treasuryBaseTokenAccount: treasuryBaseTokenAccount,
        rewardPoolBaseTokenAccount: rewardPoolBaseTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .transaction();

    // Fetch recent blockhash and set transaction properties
    const connection = blockchainService.getConnection();
    const { blockhash } = await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = userPubkey;

    // Calculate penalty (2%)
    const totalAmount = parseInt(goal.currentAmount) + parseInt(goal.accruedInterest);
    const penalty = Math.floor(totalAmount * 0.02); // 2% penalty
    const amountAfterPenalty = totalAmount - penalty;

    return {
      transaction: tx,
      message: `Early withdrawal will burn sTokens and return ${amountAfterPenalty} tokens (2% penalty applied)`,
      principal: goal.currentAmount,
      interest: goal.accruedInterest,
      totalBeforePenalty: totalAmount.toString(),
      penalty: penalty.toString(),
      totalAfterPenalty: amountAfterPenalty.toString(),
    };
  } catch (error) {
    console.error("Error building withdraw early transaction:", error);
    throw error;
  }
}

/**
 * Build claim faucet tokens transaction
 * For testing on Devnet - claims USDC or IDRX tokens
 */
async function buildClaimFaucetTx(params) {
  try {
    const {
      userWallet,
      tokenMint, // USDC or IDRX mint address
    } = params;

    const program = blockchainService.getProgram();
    const userPubkey = new PublicKey(userWallet);
    const tokenMintPubkey = new PublicKey(tokenMint);

    // Get PDAs
    const faucetConfigPDA = blockchainService.getFaucetConfigPDA();
    const userFaucetAccountPDA = blockchainService.getUserFaucetAccountPDA(userPubkey);

    // Get token accounts
    const userTokenAccount = getAssociatedTokenAddressSync(
      tokenMintPubkey,
      userPubkey
    );

    // Faucet token account (owned by faucet PDA)
    const faucetTokenAccount = getAssociatedTokenAddressSync(
      tokenMintPubkey,
      faucetConfigPDA,
      true // allowOwnerOffCurve
    );

    const tx = await program.methods
      .claimTokens()
      .accounts({
        user: userPubkey,
        faucetConfig: faucetConfigPDA,
        userFaucetAccount: userFaucetAccountPDA,
        tokenMint: tokenMintPubkey,
        faucetTokenAccount: faucetTokenAccount,
        userTokenAccount: userTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .transaction();

    // Fetch recent blockhash and set transaction properties
    const connection = blockchainService.getConnection();
    const { blockhash } = await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = userPubkey;

    return {
      transaction: tx,
      userTokenAccount: userTokenAccount.toString(),
    };
  } catch (error) {
    console.error("Error building claim faucet transaction:", error);
    throw error;
  }
}

module.exports = {
  CURRENCY_IDS,
  buildInitializeUserTx,
  buildCreateGoalTx,
  buildDepositTx,
  buildWithdrawCompletedTx,
  buildWithdrawEarlyTx,
  buildClaimFaucetTx,
};
