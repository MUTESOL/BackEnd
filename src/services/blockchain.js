const { Connection, PublicKey, clusterApiUrl } = require("@solana/web3.js");
const { AnchorProvider, Program, BN } = require("@coral-xyz/anchor");
const { TOKEN_PROGRAM_ID } = require("@solana/spl-token");
const idl = require("../config/idl.json");

/**
 * Blockchain Service - Singleton pattern for Solana/Anchor interactions
 * Handles all communication with the StackSave smart contract on Solana
 */
class BlockchainService {
  constructor() {
    if (BlockchainService.instance) {
      return BlockchainService.instance;
    }

    this.connection = null;
    this.program = null;
    this.programId = null;
    this.initialized = false;

    BlockchainService.instance = this;
  }

  /**
   * Initialize the blockchain service
   */
  async initialize() {
    if (this.initialized) {
      return;
    }

    try {
      // Get configuration from environment
      const rpcUrl = process.env.SOLANA_RPC_URL || clusterApiUrl("devnet");
      const programIdStr = process.env.PROGRAM_ID;

      if (!programIdStr) {
        throw new Error("PROGRAM_ID not set in environment variables");
      }

      // Create connection
      this.connection = new Connection(rpcUrl, "confirmed");
      this.programId = new PublicKey(programIdStr);

      // Create a dummy wallet for read-only operations
      // For write operations, the wallet will come from the client
      const dummyWallet = {
        publicKey: PublicKey.default,
        signTransaction: async (tx) => tx,
        signAllTransactions: async (txs) => txs,
      };

      // Create provider
      const provider = new AnchorProvider(
        this.connection,
        dummyWallet,
        { commitment: "confirmed" }
      );

      // Initialize program
      this.program = new Program(idl, provider);

      this.initialized = true;
      console.log("✅ Blockchain service initialized");
      console.log(`   RPC: ${rpcUrl}`);
      console.log(`   Program ID: ${programIdStr}`);
    } catch (error) {
      console.error("❌ Failed to initialize blockchain service:", error);
      throw error;
    }
  }

  /**
   * Get the global state PDA
   */
  getGlobalStatePDA() {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("global_state")],
      this.programId
    );
    return pda;
  }

  /**
   * Get the currency config PDA for a specific currency ID
   */
  getCurrencyConfigPDA(currencyId) {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("currency"), Buffer.from([currencyId])],
      this.programId
    );
    return pda;
  }

  /**
   * Get the savings mint PDA for a specific currency ID
   */
  getSavingsMintPDA(currencyId) {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("savings_mint"), Buffer.from([currencyId])],
      this.programId
    );
    return pda;
  }

  /**
   * Get the user account PDA for a wallet address
   */
  getUserAccountPDA(userWallet) {
    const walletPubkey = typeof userWallet === "string"
      ? new PublicKey(userWallet)
      : userWallet;

    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("user"), walletPubkey.toBuffer()],
      this.programId
    );
    return pda;
  }

  /**
   * Get the goal account PDA for a user and goal index
   */
  getGoalAccountPDA(userWallet, goalIndex) {
    const walletPubkey = typeof userWallet === "string"
      ? new PublicKey(userWallet)
      : userWallet;

    const [pda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("goal"),
        walletPubkey.toBuffer(),
        Buffer.from([goalIndex]),
      ],
      this.programId
    );
    return pda;
  }

  /**
   * Get the faucet config PDA
   */
  getFaucetConfigPDA() {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("faucet_config")],
      this.programId
    );
    return pda;
  }

  /**
   * Get the user faucet account PDA
   */
  getUserFaucetAccountPDA(userWallet) {
    const walletPubkey = typeof userWallet === "string"
      ? new PublicKey(userWallet)
      : userWallet;

    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("user_faucet"), walletPubkey.toBuffer()],
      this.programId
    );
    return pda;
  }

  /**
   * Fetch global state account data
   */
  async getGlobalState() {
    try {
      const globalStatePDA = this.getGlobalStatePDA();
      const account = await this.program.account.globalState.fetch(globalStatePDA);
      return {
        authority: account.authority.toString(),
        treasury: account.treasury.toString(),
        rewardPool: account.rewardPool.toString(),
        earlyWithdrawalPenalty: account.earlyWithdrawalPenalty,
        totalCurrencies: account.totalCurrencies,
      };
    } catch (error) {
      console.error("Error fetching global state:", error);
      throw error;
    }
  }

  /**
   * Fetch currency configuration
   */
  async getCurrencyConfig(currencyId) {
    try {
      const currencyConfigPDA = this.getCurrencyConfigPDA(currencyId);
      const account = await this.program.account.currencyConfig.fetch(currencyConfigPDA);
      return {
        currencyId: account.currencyId,
        baseTokenMint: account.baseTokenMint.toString(),
        savingsTokenMint: account.savingsTokenMint.toString(),
        liteApy: account.liteApy,
        proLowRiskApy: account.proLowRiskApy,
        proMediumRiskApy: account.proMediumRiskApy,
        proHighRiskApy: account.proHighRiskApy,
        totalDeposited: account.totalDeposited.toString(),
        totalGoals: account.totalGoals.toString(),
      };
    } catch (error) {
      console.error(`Error fetching currency config for ID ${currencyId}:`, error);
      throw error;
    }
  }

  /**
   * Fetch all currency configurations (USDC = 0, IDRX = 1)
   */
  async getAllCurrencies() {
    try {
      const currencies = [];
      // Try to fetch USDC (0) and IDRX (1)
      for (let i = 0; i < 2; i++) {
        try {
          const config = await this.getCurrencyConfig(i);
          currencies.push(config);
        } catch (error) {
          // Currency might not be initialized yet
          console.log(`Currency ID ${i} not found (not initialized yet)`);
        }
      }
      return currencies;
    } catch (error) {
      console.error("Error fetching currencies:", error);
      throw error;
    }
  }

  /**
   * Fetch user account data
   */
  async getUserAccount(userWallet) {
    try {
      const userAccountPDA = this.getUserAccountPDA(userWallet);
      const account = await this.program.account.userAccount.fetch(userAccountPDA);
      return {
        owner: account.owner.toString(),
        totalGoalsCreated: account.totalGoalsCreated,
        activeGoals: account.activeGoals,
        lifetimeDeposits: account.lifetimeDeposits.toString(),
        lifetimeWithdrawals: account.lifetimeWithdrawals.toString(),
      };
    } catch (error) {
      // User might not be initialized yet
      if (error.message.includes("Account does not exist")) {
        return null;
      }
      console.error("Error fetching user account:", error);
      throw error;
    }
  }

  /**
   * Fetch goal account data
   */
  async getGoalAccount(userWallet, goalIndex) {
    try {
      const goalAccountPDA = this.getGoalAccountPDA(userWallet, goalIndex);
      const account = await this.program.account.goalAccount.fetch(goalAccountPDA);
      return {
        owner: account.owner.toString(),
        goalIndex: account.goalIndex,
        name: account.name,
        targetAmount: account.targetAmount.toString(),
        currentAmount: account.currentAmount.toString(),
        mode: Object.keys(account.mode)[0], // { lite: {} } or { pro: {} }
        riskTier: account.riskTier ? Object.keys(account.riskTier)[0] : null,
        currencyId: account.currencyId,
        createdAt: account.createdAt.toString(),
        deadline: account.deadline.toString(),
        status: Object.keys(account.status)[0], // active, completed, withdrawn
        principal: account.principal.toString(),
        accruedInterest: account.accruedInterest.toString(),
        lastInterestUpdate: account.lastInterestUpdate.toString(),
        consecutiveDepositDays: account.consecutiveDepositDays,
        lastDepositDay: account.lastDepositDay.toString(),
        totalDeposits: account.totalDeposits,
        firstTimeBonus: account.firstTimeBonus,
        nftMint: account.nftMint ? account.nftMint.toString() : null,
      };
    } catch (error) {
      if (error.message.includes("Account does not exist")) {
        return null;
      }
      console.error(`Error fetching goal account ${goalIndex}:`, error);
      throw error;
    }
  }

  /**
   * Fetch all goals for a user
   */
  async getUserGoals(userWallet) {
    try {
      const userAccount = await this.getUserAccount(userWallet);
      if (!userAccount) {
        return [];
      }

      const goals = [];
      // Fetch all created goals (up to totalGoalsCreated)
      for (let i = 0; i < userAccount.totalGoalsCreated; i++) {
        const goal = await this.getGoalAccount(userWallet, i);
        if (goal) {
          goals.push(goal);
        }
      }
      return goals;
    } catch (error) {
      console.error("Error fetching user goals:", error);
      throw error;
    }
  }

  /**
   * Fetch faucet configuration
   */
  async getFaucetConfig() {
    try {
      const faucetConfigPDA = this.getFaucetConfigPDA();
      const account = await this.program.account.faucetConfig.fetch(faucetConfigPDA);
      return {
        authority: account.authority.toString(),
        tokenMint: account.tokenMint.toString(),
        amountPerClaim: account.amountPerClaim.toString(),
        cooldownPeriod: account.cooldownPeriod.toString(),
        maxClaimsPerDay: account.maxClaimsPerDay,
        totalClaimed: account.totalClaimed.toString(),
        totalUsers: account.totalUsers,
      };
    } catch (error) {
      if (error.message.includes("Account does not exist")) {
        return null;
      }
      console.error("Error fetching faucet config:", error);
      throw error;
    }
  }

  /**
   * Fetch user faucet account
   */
  async getUserFaucetAccount(userWallet) {
    try {
      const userFaucetPDA = this.getUserFaucetAccountPDA(userWallet);
      const account = await this.program.account.userFaucetAccount.fetch(userFaucetPDA);
      return {
        user: account.user.toString(),
        lastClaimTime: account.lastClaimTime.toString(),
        claimsToday: account.claimsToday,
        totalClaims: account.totalClaims.toString(),
      };
    } catch (error) {
      if (error.message.includes("Account does not exist")) {
        return null;
      }
      console.error("Error fetching user faucet account:", error);
      throw error;
    }
  }

  /**
   * Get SOL balance for an address
   */
  async getBalance(address) {
    try {
      const publicKey = new PublicKey(address);
      const balance = await this.connection.getBalance(publicKey);
      return balance / 1e9; // Convert lamports to SOL
    } catch (error) {
      console.error("Error fetching balance:", error);
      throw error;
    }
  }

  /**
   * Get the connection instance
   */
  getConnection() {
    return this.connection;
  }

  /**
   * Get the program instance
   */
  getProgram() {
    return this.program;
  }
}

// Export singleton instance
const blockchainService = new BlockchainService();
module.exports = blockchainService;
