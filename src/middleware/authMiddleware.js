const { PublicKey } = require('@solana/web3.js');
const nacl = require('tweetnacl');
const bs58 = require('bs58');

/**
 * Wallet Signature Authentication Middleware
 *
 * Verifies that requests are signed by the wallet owner
 * Prevents unauthorized access to user data and transaction endpoints
 *
 * SIMPLIFIED MODE: Set SIMPLE_AUTH=true in .env to skip signature verification (dev only)
 */
function verifyWalletSignature(req, res, next) {
  try {
    // Extract auth headers
    const walletAddress = req.headers['x-wallet-address'];
    const signature = req.headers['x-signature'];
    const message = req.headers['x-message'];
    const timestamp = req.headers['x-timestamp'];

    // SIMPLIFIED AUTH MODE (for fast development)
    const simpleAuthMode = process.env.SIMPLE_AUTH === 'true';

    if (simpleAuthMode) {
      // Only require wallet address and timestamp
      if (!walletAddress || !timestamp) {
        return res.status(401).json({
          success: false,
          error: 'Missing authentication headers',
          message: 'Required: X-Wallet-Address, X-Timestamp',
        });
      }

      // Validate wallet address format
      let publicKey;
      try {
        publicKey = new PublicKey(walletAddress);
      } catch (error) {
        return res.status(401).json({
          success: false,
          error: 'Invalid wallet address',
          message: 'Wallet address is not a valid Solana public key',
        });
      }

      // Validate timestamp
      const requestTimestamp = parseInt(timestamp);
      if (isNaN(requestTimestamp)) {
        return res.status(401).json({
          success: false,
          error: 'Invalid timestamp',
        });
      }

      // Set authenticated wallet and continue
      req.authenticatedWallet = walletAddress;
      req.walletPublicKey = publicKey;
      return next();
    }

    // FULL AUTH MODE - Check all required headers present
    if (!walletAddress || !signature || !message || !timestamp) {
      return res.status(401).json({
        success: false,
        error: 'Missing authentication headers',
        message: 'Required: X-Wallet-Address, X-Signature, X-Message, X-Timestamp',
      });
    }

    // Validate timestamp (prevent replay attacks)
    const requestTimestamp = parseInt(timestamp);
    const currentTimestamp = Date.now();
    const fiveMinutes = 5 * 60 * 1000; // 5 minutes in milliseconds

    if (isNaN(requestTimestamp)) {
      return res.status(401).json({
        success: false,
        error: 'Invalid timestamp',
        message: 'Timestamp must be a valid number',
      });
    }

    // Check if timestamp is within acceptable window (5 minutes)
    if (Math.abs(currentTimestamp - requestTimestamp) > fiveMinutes) {
      return res.status(401).json({
        success: false,
        error: 'Timestamp expired',
        message: 'Request timestamp is too old or too far in the future',
      });
    }

    // Validate wallet address format
    let publicKey;
    try {
      publicKey = new PublicKey(walletAddress);
    } catch (error) {
      return res.status(401).json({
        success: false,
        error: 'Invalid wallet address',
        message: 'Wallet address is not a valid Solana public key',
      });
    }

    // Decode signature and message
    let signatureBytes;
    let messageBytes;
    try {
      signatureBytes = bs58.decode(signature);
      messageBytes = Buffer.from(message, 'utf-8');
    } catch (error) {
      return res.status(401).json({
        success: false,
        error: 'Invalid signature format',
        message: 'Signature must be base58 encoded',
      });
    }

    // Verify signature
    const publicKeyBytes = publicKey.toBytes();
    const isValid = nacl.sign.detached.verify(
      messageBytes,
      signatureBytes,
      publicKeyBytes
    );

    if (!isValid) {
      return res.status(401).json({
        success: false,
        error: 'Invalid signature',
        message: 'Signature verification failed',
      });
    }

    // Additional check: verify wallet in URL matches authenticated wallet
    // For endpoints like /api/users/:address
    if (req.params.address) {
      if (req.params.address !== walletAddress) {
        return res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: 'Cannot access another wallet\'s data',
        });
      }
    }

    // Check wallet in body matches (for POST requests)
    if (req.body && req.body.walletAddress) {
      if (req.body.walletAddress !== walletAddress) {
        return res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: 'Wallet address in request body must match authenticated wallet',
        });
      }
    }

    // Authentication successful - attach wallet address to request
    req.authenticatedWallet = walletAddress;
    req.walletPublicKey = publicKey;

    next();
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(500).json({
      success: false,
      error: 'Authentication failed',
      message: error.message,
    });
  }
}

/**
 * Optional authentication - allows requests through but sets authenticatedWallet if present
 * Useful for endpoints that can work with or without authentication
 */
function optionalAuth(req, res, next) {
  const walletAddress = req.headers['x-wallet-address'];

  if (!walletAddress) {
    // No auth provided, continue without it
    return next();
  }

  // Auth provided, verify it
  verifyWalletSignature(req, res, next);
}

module.exports = {
  verifyWalletSignature,
  optionalAuth,
};
