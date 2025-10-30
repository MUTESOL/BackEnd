-- MUTESOL (StackSave) Database Schema
-- PostgreSQL database for caching on-chain data and providing analytics

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table - Cache user account data from blockchain
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wallet_address VARCHAR(44) NOT NULL UNIQUE,
    user_account_pda VARCHAR(44) NOT NULL UNIQUE,
    total_goals_created INTEGER DEFAULT 0,
    active_goals INTEGER DEFAULT 0,
    lifetime_deposits BIGINT DEFAULT 0,
    lifetime_withdrawals BIGINT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_synced_at TIMESTAMP
);

-- Goals table - Cache goal data from blockchain
CREATE TABLE IF NOT EXISTS goals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    wallet_address VARCHAR(44) NOT NULL,
    goal_account_pda VARCHAR(44) NOT NULL UNIQUE,
    goal_index INTEGER NOT NULL,
    name VARCHAR(255) NOT NULL,
    target_amount BIGINT NOT NULL,
    current_amount BIGINT DEFAULT 0,
    mode VARCHAR(10) NOT NULL, -- 'lite' or 'pro'
    risk_tier VARCHAR(10), -- 'low', 'medium', 'high' (for pro mode)
    currency_id INTEGER NOT NULL, -- 0 for USDC, 1 for IDRX
    currency_name VARCHAR(10) NOT NULL, -- 'USDC' or 'IDRX'
    created_at_blockchain BIGINT NOT NULL, -- Unix timestamp from blockchain
    deadline BIGINT NOT NULL, -- Unix timestamp
    status VARCHAR(20) NOT NULL DEFAULT 'active', -- 'active', 'completed', 'withdrawn'
    principal BIGINT DEFAULT 0,
    accrued_interest BIGINT DEFAULT 0,
    last_interest_update BIGINT,
    consecutive_deposit_days INTEGER DEFAULT 0,
    last_deposit_day BIGINT DEFAULT 0,
    total_deposits INTEGER DEFAULT 0,
    first_time_bonus BOOLEAN DEFAULT FALSE,
    nft_mint VARCHAR(44),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_synced_at TIMESTAMP,
    CONSTRAINT unique_user_goal_index UNIQUE (wallet_address, goal_index)
);

-- Transactions table - Log all transactions (deposits, withdrawals, faucet claims)
CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    wallet_address VARCHAR(44) NOT NULL,
    goal_id UUID REFERENCES goals(id) ON DELETE SET NULL,
    goal_index INTEGER,
    transaction_type VARCHAR(20) NOT NULL, -- 'deposit', 'withdraw_completed', 'withdraw_early', 'faucet_claim'
    operation VARCHAR(10) NOT NULL, -- 'MINT', 'BURN', 'CLAIM'
    currency_id INTEGER NOT NULL,
    currency_name VARCHAR(10) NOT NULL,
    amount BIGINT NOT NULL,
    interest BIGINT DEFAULT 0,
    penalty BIGINT DEFAULT 0,
    final_amount BIGINT NOT NULL,
    transaction_signature VARCHAR(88), -- Solana transaction signature
    status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'confirmed', 'failed'
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    confirmed_at TIMESTAMP
);

-- Faucet claims table - Track faucet usage
CREATE TABLE IF NOT EXISTS faucet_claims (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    wallet_address VARCHAR(44) NOT NULL,
    currency_name VARCHAR(10) NOT NULL,
    amount BIGINT NOT NULL,
    transaction_signature VARCHAR(88),
    claimed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Analytics table - Daily snapshots for analytics
CREATE TABLE IF NOT EXISTS daily_analytics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    date DATE NOT NULL,
    total_users INTEGER DEFAULT 0,
    active_users INTEGER DEFAULT 0, -- Users with active goals
    total_goals INTEGER DEFAULT 0,
    active_goals INTEGER DEFAULT 0,
    total_deposits_count INTEGER DEFAULT 0,
    total_deposits_volume_usdc BIGINT DEFAULT 0,
    total_deposits_volume_idrx BIGINT DEFAULT 0,
    total_withdrawals_count INTEGER DEFAULT 0,
    total_withdrawals_volume_usdc BIGINT DEFAULT 0,
    total_withdrawals_volume_idrx BIGINT DEFAULT 0,
    total_interest_paid_usdc BIGINT DEFAULT 0,
    total_interest_paid_idrx BIGINT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_date UNIQUE (date)
);

-- Currency configurations table - Cache currency configs from blockchain
CREATE TABLE IF NOT EXISTS currency_configs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    currency_id INTEGER NOT NULL UNIQUE,
    currency_name VARCHAR(10) NOT NULL,
    base_token_mint VARCHAR(44) NOT NULL,
    savings_token_mint VARCHAR(44) NOT NULL,
    lite_apy INTEGER NOT NULL, -- In basis points (e.g., 600 = 6%)
    pro_low_risk_apy INTEGER NOT NULL,
    pro_medium_risk_apy INTEGER NOT NULL,
    pro_high_risk_apy INTEGER NOT NULL,
    total_deposited BIGINT DEFAULT 0,
    total_goals BIGINT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_synced_at TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_wallet ON users(wallet_address);
CREATE INDEX IF NOT EXISTS idx_goals_wallet ON goals(wallet_address);
CREATE INDEX IF NOT EXISTS idx_goals_status ON goals(status);
CREATE INDEX IF NOT EXISTS idx_goals_user_id ON goals(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_wallet ON transactions(wallet_address);
CREATE INDEX IF NOT EXISTS idx_transactions_goal ON transactions(goal_id);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_transactions_signature ON transactions(transaction_signature);
CREATE INDEX IF NOT EXISTS idx_transactions_created ON transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_faucet_claims_wallet ON faucet_claims(wallet_address);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers to auto-update updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_goals_updated_at BEFORE UPDATE ON goals
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_currency_configs_updated_at BEFORE UPDATE ON currency_configs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Views for common queries

-- Active goals view
CREATE OR REPLACE VIEW active_goals_view AS
SELECT
    g.*,
    u.wallet_address as user_wallet,
    (g.current_amount + g.accrued_interest) as total_value,
    CASE
        WHEN g.target_amount > 0 THEN (g.current_amount::FLOAT / g.target_amount::FLOAT * 100)
        ELSE 0
    END as progress_percentage
FROM goals g
JOIN users u ON g.user_id = u.id
WHERE g.status = 'active';

-- User statistics view
CREATE OR REPLACE VIEW user_stats_view AS
SELECT
    u.*,
    COUNT(DISTINCT g.id) FILTER (WHERE g.status = 'active') as active_goals_count,
    COUNT(DISTINCT g.id) FILTER (WHERE g.status = 'completed') as completed_goals_count,
    SUM(g.current_amount) FILTER (WHERE g.status = 'active') as total_active_balance,
    SUM(g.accrued_interest) FILTER (WHERE g.status = 'active') as total_accrued_interest,
    COUNT(DISTINCT t.id) FILTER (WHERE t.transaction_type LIKE 'deposit%') as total_deposit_count,
    COUNT(DISTINCT t.id) FILTER (WHERE t.transaction_type LIKE 'withdraw%') as total_withdrawal_count
FROM users u
LEFT JOIN goals g ON u.id = g.user_id
LEFT JOIN transactions t ON u.id = t.user_id AND t.status = 'confirmed'
GROUP BY u.id;

-- Comments for documentation
COMMENT ON TABLE users IS 'Caches user account data from Solana blockchain';
COMMENT ON TABLE goals IS 'Caches savings goal data from Solana blockchain';
COMMENT ON TABLE transactions IS 'Logs all transactions for analytics and history';
COMMENT ON TABLE faucet_claims IS 'Tracks faucet token claims on devnet';
COMMENT ON TABLE daily_analytics IS 'Daily aggregated statistics for dashboards';
COMMENT ON TABLE currency_configs IS 'Caches currency configuration from blockchain';

-- Insert initial data (will be populated when syncing with blockchain)
-- This is just placeholder structure

COMMENT ON DATABASE mutesol IS 'MUTESOL (StackSave) - Gamified DeFi savings platform on Solana';
