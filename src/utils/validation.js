const { PublicKey } = require("@solana/web3.js");

/**
 * Validate if a string is a valid Solana wallet address
 * @param {string} address - The address to validate
 * @returns {boolean} - True if valid, false otherwise
 */
function isValidSolanaAddress(address) {
  if (!address || typeof address !== "string") {
    return false;
  }

  try {
    // Try to create a PublicKey - will throw if invalid
    new PublicKey(address);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Validate Solana address and return detailed error info
 * @param {string} address - The address to validate
 * @returns {object} - { valid: boolean, error?: string, suggestion?: string }
 */
function validateSolanaAddress(address) {
  if (!address) {
    return {
      valid: false,
      error: "Address is required",
      suggestion: "Please provide a wallet address",
    };
  }

  if (typeof address !== "string") {
    return {
      valid: false,
      error: "Address must be a string",
      suggestion: "Wallet address should be a text string",
    };
  }

  // Check if it's a placeholder
  if (address.toUpperCase().includes("YOUR") ||
      address.toUpperCase().includes("WALLET") ||
      address.toUpperCase().includes("ADDRESS")) {
    return {
      valid: false,
      error: "Placeholder address detected",
      suggestion: "Replace 'YOUR_WALLET_ADDRESS' with your actual Solana wallet address (e.g., from Phantom, Solflare, or Backpack wallet)",
    };
  }

  // Check length (Solana addresses are typically 32-44 characters in base58)
  if (address.length < 32 || address.length > 44) {
    return {
      valid: false,
      error: "Invalid address length",
      suggestion: `Solana addresses are typically 32-44 characters. Your input has ${address.length} characters.`,
    };
  }

  // Check for invalid base58 characters
  const base58Regex = /^[1-9A-HJ-NP-Za-km-z]+$/;
  if (!base58Regex.test(address)) {
    const invalidChars = address.split("").filter(char => !base58Regex.test(char));
    return {
      valid: false,
      error: "Invalid characters in address",
      suggestion: `Solana addresses use base58 encoding (excludes 0, O, I, l). Found invalid characters: ${[...new Set(invalidChars)].join(", ")}`,
    };
  }

  // Final validation using PublicKey constructor
  try {
    new PublicKey(address);
    return {
      valid: true,
    };
  } catch (error) {
    return {
      valid: false,
      error: "Invalid Solana address format",
      suggestion: error.message || "The address format is incorrect",
    };
  }
}

module.exports = {
  isValidSolanaAddress,
  validateSolanaAddress,
};
