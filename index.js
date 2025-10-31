require("dotenv").config();
const express = require("express");
const cors = require("cors");
const blockchainService = require("./src/services/blockchain");
const db = require("./src/config/db");
const { errorHandler, notFoundHandler } = require("./src/middleware/errorHandler");
const { verifyWalletSignature } = require("./src/middleware/authMiddleware");

// Import routes
const usersRoutes = require("./src/routes/users");
const goalsRoutes = require("./src/routes/goals");
const transactionsRoutes = require("./src/routes/transactions");

const app = express();

// ==========================================
// Middleware
// ==========================================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS configuration
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  })
);

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.path} - ${res.statusCode} - ${duration}ms`);
  });
  next();
});

// ==========================================
// Health Check
// ==========================================
app.get("/", (req, res) => {
  res.json({
    name: "MUTESOL (StackSave) Backend API",
    version: "1.0.0",
    status: "running",
    timestamp: new Date().toISOString(),
    endpoints: {
      health: "GET /health",
      users: "GET /api/users/*",
      goals: "GET /api/goals/*",
      transactions: "GET /api/transactions/*",
    },
  });
});

app.get("/health", async (req, res) => {
  try {
    // Check blockchain connection
    const blockchainHealthy = blockchainService.initialized;

    // Check database connection (optional - with 2 second timeout)
    let databaseHealthy = false;
    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Database timeout")), 2000)
      );
      await Promise.race([db.query("SELECT 1"), timeoutPromise]);
      databaseHealthy = true;
    } catch (error) {
      console.error("Database health check failed:", error.message);
    }

    // Database is optional - only blockchain needs to be healthy
    const isHealthy = blockchainHealthy;

    res.status(isHealthy ? 200 : 503).json({
      status: isHealthy ? "healthy" : "unhealthy",
      blockchain: {
        connected: blockchainHealthy,
        network: process.env.SOLANA_NETWORK || "devnet",
        programId: process.env.PROGRAM_ID,
      },
      database: {
        connected: databaseHealthy,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({
      status: "unhealthy",
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// ==========================================
// API Routes (with authentication)
// ==========================================
// Apply wallet signature authentication to all protected routes
app.use("/api/users", verifyWalletSignature, usersRoutes);
app.use("/api/goals", verifyWalletSignature, goalsRoutes);
app.use("/api/transactions", verifyWalletSignature, transactionsRoutes);

// Legacy endpoint for backwards compatibility
app.get("/balance/:address", async (req, res) => {
  try {
    const balance = await blockchainService.getBalance(req.params.address);
    res.json({
      address: req.params.address,
      balance: `${balance} SOL`,
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ==========================================
// Error Handling
// ==========================================
app.use(notFoundHandler);
app.use(errorHandler);

// ==========================================
// Server Startup
// ==========================================
const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    console.log("🚀 Starting MUTESOL (StackSave) Backend...\n");

    // Initialize blockchain service
    console.log("📡 Initializing blockchain service...");
    await blockchainService.initialize();

    // Test database connection
    console.log("\n💾 Testing database connection...");
    const dbConnected = await db.testConnection();

    if (!dbConnected) {
      console.warn("⚠️  Database connection failed. API will run with limited functionality.");
      console.warn("   Some features requiring database access may not work.");
    }

    // Start server
    app.listen(PORT, () => {
      console.log("\n" + "=".repeat(60));
      console.log("✅ MUTESOL Backend API is running!");
      console.log("=".repeat(60));
      console.log(`   Server:        http://localhost:${PORT}`);
      console.log(`   Health Check:  http://localhost:${PORT}/health`);
      console.log(`   Network:       ${process.env.SOLANA_NETWORK || "devnet"}`);
      console.log(`   Program ID:    ${process.env.PROGRAM_ID}`);
      console.log("=".repeat(60));
      console.log("\n📚 API Documentation:");
      console.log("   Users:         POST /api/users/initialize");
      console.log("                  GET  /api/users/:address");
      console.log("                  GET  /api/users/:address/stats");
      console.log("   Goals:         POST /api/goals/create");
      console.log("                  GET  /api/goals/user/:address");
      console.log("                  GET  /api/goals/:address/:goalIndex");
      console.log("   Transactions:  POST /api/transactions/deposit (MINT)");
      console.log("                  POST /api/transactions/withdraw (BURN)");
      console.log("                  POST /api/transactions/faucet/claim");
      console.log("=".repeat(60) + "\n");
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on("SIGTERM", async () => {
  console.log("\n🛑 SIGTERM received, shutting down gracefully...");
  await db.close();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("\n🛑 SIGINT received, shutting down gracefully...");
  await db.close();
  process.exit(0);
});

// Start the server
startServer();
