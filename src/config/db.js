const { Pool } = require("pg");

/**
 * PostgreSQL Database Configuration
 * Connection pool for efficient database queries
 */

let pool;

/**
 * Initialize database connection pool
 */
function initializePool() {
  if (pool) {
    return pool;
  }

  const config = {
    connectionString: process.env.DATABASE_URL,
    // Alternative configuration if not using connection string
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "5432"),
    database: process.env.DB_NAME || "mutesol",
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD,
    // Connection pool settings
    max: 20, // Maximum number of clients in the pool
    idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
    connectionTimeoutMillis: 10000, // Return error after 10 seconds if connection fails
  };

  // Add SSL if in production
  if (process.env.NODE_ENV === "production" && process.env.DB_SSL === "true") {
    config.ssl = {
      rejectUnauthorized: false,
    };
  }

  pool = new Pool(config);

  // Handle pool errors
  pool.on("error", (err) => {
    console.error("Unexpected database pool error:", err);
  });

  pool.on("connect", () => {
    console.log("✅ Database pool connected");
  });

  return pool;
}

/**
 * Get the database pool instance
 */
function getPool() {
  if (!pool) {
    return initializePool();
  }
  return pool;
}

/**
 * Execute a query with automatic connection handling
 * @param {string} text - SQL query text
 * @param {Array} params - Query parameters
 * @returns {Promise<Object>} Query result
 */
async function query(text, params) {
  const start = Date.now();
  try {
    const result = await getPool().query(text, params);
    const duration = Date.now() - start;

    if (process.env.NODE_ENV === "development") {
      console.log("Executed query:", {
        text: text.substring(0, 100) + (text.length > 100 ? "..." : ""),
        duration: `${duration}ms`,
        rows: result.rowCount,
      });
    }

    return result;
  } catch (error) {
    console.error("Database query error:", error);
    throw error;
  }
}

/**
 * Get a client from the pool for transactions
 * @returns {Promise<Object>} Database client
 */
async function getClient() {
  const client = await getPool().connect();

  // Add query method to client for consistency
  const originalQuery = client.query.bind(client);
  const clientQuery = (text, params) => {
    const start = Date.now();
    return originalQuery(text, params).then((result) => {
      const duration = Date.now() - start;

      if (process.env.NODE_ENV === "development") {
        console.log("Client query:", {
          text: text.substring(0, 100) + (text.length > 100 ? "..." : ""),
          duration: `${duration}ms`,
          rows: result.rowCount,
        });
      }

      // Warn about long-running queries
      if (duration > 5000) {
        console.warn(`⚠️ Slow query detected (${duration}ms):`, text.substring(0, 200));
      }

      return result;
    });
  };

  client.query = clientQuery;
  return client;
}

/**
 * Execute a function within a database transaction
 * @param {Function} callback - Async function to execute within transaction
 * @returns {Promise<any>} Result of the callback
 */
async function transaction(callback) {
  const client = await getClient();

  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Test database connection
 * @returns {Promise<boolean>} True if connected successfully
 */
async function testConnection() {
  try {
    const result = await query("SELECT NOW() as now");
    console.log("✅ Database connection successful:", result.rows[0].now);
    return true;
  } catch (error) {
    console.error("❌ Database connection failed:", error.message);
    return false;
  }
}

/**
 * Close all database connections
 */
async function close() {
  if (pool) {
    await pool.end();
    pool = null;
    console.log("Database pool closed");
  }
}

/**
 * Helper function to cache user data from blockchain
 */
async function cacheUser(userData) {
  const { walletAddress, userAccountPDA } = userData;

  try {
    const result = await query(
      `INSERT INTO users (wallet_address, user_account_pda, last_synced_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (wallet_address)
       DO UPDATE SET
         user_account_pda = EXCLUDED.user_account_pda,
         last_synced_at = NOW()
       RETURNING *`,
      [walletAddress, userAccountPDA]
    );

    return result.rows[0];
  } catch (error) {
    console.error("Error caching user:", error);
    throw error;
  }
}

/**
 * Helper function to cache goal data from blockchain
 */
async function cacheGoal(goalData) {
  const {
    userId,
    walletAddress,
    goalAccountPDA,
    goalIndex,
    name,
    targetAmount,
    currentAmount,
    mode,
    riskTier,
    currencyId,
    currencyName,
    createdAt,
    deadline,
    status,
    principal,
    accruedInterest,
  } = goalData;

  try {
    const result = await query(
      `INSERT INTO goals (
        user_id, wallet_address, goal_account_pda, goal_index, name,
        target_amount, current_amount, mode, risk_tier, currency_id,
        currency_name, created_at_blockchain, deadline, status, principal,
        accrued_interest, last_synced_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW())
      ON CONFLICT (goal_account_pda)
      DO UPDATE SET
        current_amount = EXCLUDED.current_amount,
        status = EXCLUDED.status,
        principal = EXCLUDED.principal,
        accrued_interest = EXCLUDED.accrued_interest,
        last_synced_at = NOW()
      RETURNING *`,
      [
        userId, walletAddress, goalAccountPDA, goalIndex, name,
        targetAmount, currentAmount, mode, riskTier, currencyId,
        currencyName, createdAt, deadline, status, principal,
        accruedInterest
      ]
    );

    return result.rows[0];
  } catch (error) {
    console.error("Error caching goal:", error);
    throw error;
  }
}

/**
 * Helper function to log transaction
 */
async function logTransaction(txData) {
  const {
    userId,
    walletAddress,
    goalId,
    goalIndex,
    transactionType,
    operation,
    currencyId,
    currencyName,
    amount,
    interest = 0,
    penalty = 0,
    finalAmount,
    transactionSignature = null,
    status = "pending",
  } = txData;

  try {
    const result = await query(
      `INSERT INTO transactions (
        user_id, wallet_address, goal_id, goal_index, transaction_type,
        operation, currency_id, currency_name, amount, interest, penalty,
        final_amount, transaction_signature, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *`,
      [
        userId, walletAddress, goalId, goalIndex, transactionType,
        operation, currencyId, currencyName, amount, interest, penalty,
        finalAmount, transactionSignature, status
      ]
    );

    return result.rows[0];
  } catch (error) {
    console.error("Error logging transaction:", error);
    throw error;
  }
}

module.exports = {
  initializePool,
  getPool,
  query,
  getClient,
  transaction,
  testConnection,
  close,
  // Helper functions
  cacheUser,
  cacheGoal,
  logTransaction,
};
