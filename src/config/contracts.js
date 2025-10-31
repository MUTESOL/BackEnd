/**
 * Solana Smart Contract Configuration
 *
 * Centralized configuration for all deployed Solana contract addresses.
 * All addresses are read from environment variables and validated on startup.
 *
 * @module config/contracts
 */

const { PublicKey } = require('@solana/web3.js');

/**
 * Validates that a value is a valid Solana public key
 * @param {string} address - The address to validate
 * @param {string} name - The name of the address (for error messages)
 * @returns {PublicKey} The validated PublicKey
 * @throws {Error} If the address is invalid or missing
 */
function validatePublicKey(address, name) {
  if (!address) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  try {
    return new PublicKey(address);
  } catch (error) {
    throw new Error(`Invalid public key for ${name}: ${address}`);
  }
}

/**
 * Solana Contract Configuration
 * @type {Object}
 */
const contracts = {
  /**
   * Network configuration
   */
  network: {
    cluster: process.env.CLUSTER || 'devnet',
    rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
  },

  /**
   * Main program ID for the StackSave smart contract
   * @type {string}
   */
  programId: process.env.PROGRAM_ID,

  /**
   * Global state and protocol accounts
   */
  globalState: {
    /** PDA for global protocol state */
    pda: process.env.GLOBAL_STATE_PDA,
    /** Treasury account for collecting fees */
    treasury: process.env.TREASURY_ACCOUNT,
    /** Reward pool account for distributing rewards */
    rewardPool: process.env.REWARD_POOL_ACCOUNT,
  },

  /**
   * USDC token configuration (Currency ID: 0)
   */
  usdc: {
    /** Currency ID used in smart contract */
    id: 0,
    /** Base USDC token mint address */
    mint: process.env.USDC_MINT,
    /** Savings USDC (sUSDC) token mint address */
    savingsMint: process.env.USDC_SAVINGS_MINT || process.env.SUSDC_MINT,
    /** Currency configuration PDA */
    configPda: process.env.USDC_CONFIG_PDA,
    /** Faucet account for test tokens */
    faucet: process.env.USDC_FAUCET,
  },

  /**
   * IDRX token configuration (Currency ID: 1)
   */
  idrx: {
    /** Currency ID used in smart contract */
    id: 1,
    /** Base IDRX token mint address */
    mint: process.env.IDRX_MINT,
    /** Savings IDRX (sIDRX) token mint address */
    savingsMint: process.env.IDRX_SAVINGS_MINT || process.env.SIDRX_MINT,
    /** Currency configuration PDA */
    configPda: process.env.IDRX_CONFIG_PDA,
    /** Faucet account for test tokens */
    faucet: process.env.IDRX_FAUCET,
  },

  /**
   * Faucet configuration (for devnet testing)
   */
  faucet: {
    enabled: process.env.FAUCET_ENABLED === 'true',
    usdcAmount: parseInt(process.env.USDC_FAUCET_AMOUNT || '1000', 10),
    idrxAmount: parseInt(process.env.IDRX_FAUCET_AMOUNT || '15000000', 10),
  },

  /**
   * Gets currency configuration by currency ID
   * @param {number} currencyId - 0 for USDC, 1 for IDRX
   * @returns {Object} Currency configuration
   */
  getCurrency(currencyId) {
    switch (currencyId) {
      case 0:
        return this.usdc;
      case 1:
        return this.idrx;
      default:
        throw new Error(`Invalid currency ID: ${currencyId}`);
    }
  },

  /**
   * Gets currency configuration by currency name
   * @param {string} currencyName - 'usdc' or 'idrx' (case-insensitive)
   * @returns {Object} Currency configuration
   */
  getCurrencyByName(currencyName) {
    const name = currencyName.toLowerCase();
    if (name === 'usdc') return this.usdc;
    if (name === 'idrx') return this.idrx;
    throw new Error(`Invalid currency name: ${currencyName}`);
  },

  /**
   * Validates all required contract addresses are configured
   * @throws {Error} If any required address is missing or invalid
   */
  validate() {
    // Validate program ID
    validatePublicKey(this.programId, 'PROGRAM_ID');

    // Validate global state accounts
    validatePublicKey(this.globalState.pda, 'GLOBAL_STATE_PDA');
    validatePublicKey(this.globalState.treasury, 'TREASURY_ACCOUNT');
    validatePublicKey(this.globalState.rewardPool, 'REWARD_POOL_ACCOUNT');

    // Validate USDC addresses
    validatePublicKey(this.usdc.mint, 'USDC_MINT');
    validatePublicKey(this.usdc.savingsMint, 'USDC_SAVINGS_MINT or SUSDC_MINT');
    validatePublicKey(this.usdc.configPda, 'USDC_CONFIG_PDA');
    validatePublicKey(this.usdc.faucet, 'USDC_FAUCET');

    // Validate IDRX addresses
    validatePublicKey(this.idrx.mint, 'IDRX_MINT');
    validatePublicKey(this.idrx.savingsMint, 'IDRX_SAVINGS_MINT or SIDRX_MINT');
    validatePublicKey(this.idrx.configPda, 'IDRX_CONFIG_PDA');
    validatePublicKey(this.idrx.faucet, 'IDRX_FAUCET');

    console.log('✅ All contract addresses validated successfully');
  },

  /**
   * Prints all configured contract addresses
   * Useful for debugging and verification
   */
  printAddresses() {
    console.log('\n📝 Solana Contract Configuration:');
    console.log('═'.repeat(60));
    console.log(`Network: ${this.network.cluster}`);
    console.log(`RPC URL: ${this.network.rpcUrl}`);
    console.log(`\nProgram ID: ${this.programId}`);
    console.log(`\nGlobal State:`);
    console.log(`  PDA: ${this.globalState.pda}`);
    console.log(`  Treasury: ${this.globalState.treasury}`);
    console.log(`  Reward Pool: ${this.globalState.rewardPool}`);
    console.log(`\nUSDC (Currency ID: ${this.usdc.id}):`);
    console.log(`  Mint: ${this.usdc.mint}`);
    console.log(`  Savings Mint: ${this.usdc.savingsMint}`);
    console.log(`  Config PDA: ${this.usdc.configPda}`);
    console.log(`  Faucet: ${this.usdc.faucet}`);
    console.log(`\nIDRX (Currency ID: ${this.idrx.id}):`);
    console.log(`  Mint: ${this.idrx.mint}`);
    console.log(`  Savings Mint: ${this.idrx.savingsMint}`);
    console.log(`  Config PDA: ${this.idrx.configPda}`);
    console.log(`  Faucet: ${this.idrx.faucet}`);
    console.log('═'.repeat(60) + '\n');
  },
};

module.exports = contracts;
