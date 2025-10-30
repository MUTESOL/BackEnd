# MUTESOL (StackSave) Backend API

Backend API for MUTESOL, a gamified DeFi savings platform built on Solana blockchain.

## Features

- 🔗 **Blockchain Integration** - Full integration with Solana StackSave smart contract
- 💰 **Mint/Burn Operations** - Deposit (MINT sTokens) and Withdrawal (BURN sTokens) transaction builders
- 🎯 **Goal Management** - Create and manage savings goals with different risk tiers
- 💱 **Multi-Currency Support** - USDC and IDRX stablecoins
- 💾 **Database Caching** - PostgreSQL for fast queries and analytics
- 🎮 **Gamification** - Streak bonuses and first-time deposit bonuses
- 🚰 **Faucet Support** - Test token distribution on Devnet

## Project Structure

```
BE/
├── src/
│   ├── config/
│   │   ├── db.js              # Database configuration
│   │   └── idl.json           # Smart contract IDL
│   ├── routes/
│   │   ├── users.js           # User management endpoints
│   │   ├── goals.js           # Goal management endpoints
│   │   └── transactions.js    # Transaction endpoints (MINT/BURN)
│   ├── services/
│   │   └── blockchain.js      # Blockchain service layer
│   ├── utils/
│   │   └── transactions.js    # Transaction builders
│   └── middleware/
│       └── errorHandler.js    # Error handling middleware
├── db/
│   └── schema.sql             # Database schema
├── .env                       # Environment variables
├── .env.example               # Environment template
├── index.js                   # Main server file
└── package.json               # Dependencies
```

## Prerequisites

- Node.js v16 or higher
- PostgreSQL 12 or higher
- Solana CLI (optional, for deployment)
- Access to Solana Devnet

## Installation

1. **Clone and install dependencies:**

```bash
cd BE
npm install
```

2. **Set up environment variables:**

```bash
cp .env.example .env
# Edit .env with your configuration
```

3. **Set up PostgreSQL database:**

```bash
# Create database
createdb mutesol

# Run schema
psql mutesol < db/schema.sql
```

4. **Update .env with your configuration:**

Required variables:
- `PROGRAM_ID` - Your deployed smart contract program ID
- `DATABASE_URL` - PostgreSQL connection string
- Token mint addresses (get from deployment)

## Usage

### Development

```bash
npm run dev
```

### Production

```bash
npm start
```

## API Endpoints

### Health Check

```
GET /health
```

Returns blockchain and database connection status.

### User Management

#### Initialize User
```
POST /api/users/initialize
Body: { "walletAddress": "..." }
```

Creates a new user account on-chain.

#### Get User
```
GET /api/users/:address
```

#### Get User Stats
```
GET /api/users/:address/stats
```

### Goal Management

#### Create Goal
```
POST /api/goals/create
Body: {
  "walletAddress": "...",
  "name": "Emergency Fund",
  "targetAmount": 10000,
  "mode": "lite",           // or "pro"
  "riskTier": "low",        // required for pro mode
  "currencyId": 0,          // 0=USDC, 1=IDRX
  "deadline": 1735689600    // Unix timestamp
}
```

#### Get All Goals
```
GET /api/goals/user/:address
GET /api/goals/user/:address?status=active
```

#### Get Specific Goal
```
GET /api/goals/:address/:goalIndex
```

#### Get Currencies
```
GET /api/goals/currencies/all
```

### Transactions

#### Deposit (MINT Operation)
```
POST /api/transactions/deposit
Body: {
  "walletAddress": "...",
  "goalIndex": 0,
  "amount": 1000,
  "currencyId": 0
}
```

**This MINTS sUSDC/sIDRX tokens** - Interest-bearing tokens created 1:1 with deposits.

#### Withdraw (BURN Operation)
```
POST /api/transactions/withdraw
Body: {
  "walletAddress": "...",
  "goalIndex": 0,
  "early": false    // true for early withdrawal (2% penalty)
}
```

**This BURNS sUSDC/sIDRX tokens** - Returns base tokens + interest.

#### Claim Faucet (Devnet Only)
```
POST /api/transactions/faucet/claim
Body: {
  "walletAddress": "...",
  "currencyId": 0
}
```

#### Get Transaction History
```
GET /api/transactions/user/:address/history
```

## Mint/Burn Operations Explained

### MINT (Deposit)
When a user deposits USDC or IDRX into a savings goal:
1. Base tokens (USDC/IDRX) are transferred from user to protocol
2. **Interest-bearing tokens (sUSDC/sIDRX) are MINTED** 1:1
3. sTokens accrue interest over time
4. Bonuses are automatically applied (first-time, streak)

### BURN (Withdrawal)
When a user withdraws from a goal:
1. **Interest-bearing tokens (sUSDC/sIDRX) are BURNED**
2. Base tokens (principal + interest) are returned to user
3. If withdrawn early (before deadline), 2% penalty is applied
4. Penalty split: 50% to treasury, 50% to reward pool

## Response Format

All endpoints return JSON with this structure:

### Success Response
```json
{
  "success": true,
  "message": "...",
  "transaction": "base64_encoded_transaction",
  "details": { ... }
}
```

### Error Response
```json
{
  "success": false,
  "error": "Error type",
  "message": "Detailed error message"
}
```

## Transaction Flow

1. **Client requests transaction** from API endpoint
2. **API builds unsigned transaction** using smart contract
3. **API returns serialized transaction** (base64) to client
4. **Client deserializes and signs** transaction with wallet
5. **Client submits** signed transaction to Solana network
6. **Transaction confirmed** on blockchain
7. **(Optional) Client notifies** API of transaction signature for caching

## Database

The backend uses PostgreSQL to cache on-chain data for:
- Fast queries without blockchain RPC calls
- Analytics and reporting
- Transaction history
- User statistics

### Tables
- `users` - User accounts
- `goals` - Savings goals
- `transactions` - Transaction logs
- `currency_configs` - Currency configurations
- `faucet_claims` - Faucet usage tracking
- `daily_analytics` - Daily aggregated stats

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `PORT` | Server port | `5000` |
| `NODE_ENV` | Environment | `development` |
| `SOLANA_RPC_URL` | Solana RPC endpoint | `https://api.devnet.solana.com` |
| `PROGRAM_ID` | Smart contract program ID | `4Ho2aKGX...` |
| `DATABASE_URL` | PostgreSQL connection | `postgresql://...` |
| `USDC_MINT` | USDC token mint address | Get from deployment |
| `IDRX_MINT` | IDRX token mint address | Get from deployment |
| `SUSDC_MINT` | sUSDC token mint address | Get from deployment |
| `SIDRX_MINT` | sIDRX token mint address | Get from deployment |
| `FAUCET_ENABLED` | Enable faucet | `true` |

## Development

### Running Tests
```bash
npm test
```

### Code Style
```bash
npm run lint
```

### Database Migrations
```bash
# Apply schema
psql $DATABASE_URL < db/schema.sql

# Reset database (WARNING: Deletes all data)
psql $DATABASE_URL < db/reset.sql
```

## Deployment

### Docker (Recommended)
```bash
docker build -t mutesol-backend .
docker run -p 5000:5000 --env-file .env mutesol-backend
```

### Manual Deployment
1. Set up PostgreSQL database
2. Run database schema
3. Configure environment variables
4. Start server: `npm start`

## Architecture

```
┌─────────────────────────────────────────┐
│          Frontend/Mobile App            │
└────────────┬────────────────────────────┘
             │
             │ REST API
             ▼
┌─────────────────────────────────────────┐
│         Express.js Backend              │
│  ┌──────────────────────────────────┐   │
│  │     Transaction Builders          │   │
│  │  (buildDepositTx, buildWithdraw)  │   │
│  └──────────────────────────────────┘   │
└────────┬──────────────────────┬─────────┘
         │                      │
         │ Anchor               │ SQL
         ▼                      ▼
┌──────────────────┐   ┌────────────────┐
│  Solana Devnet   │   │  PostgreSQL    │
│  (StackSave SC)  │   │   (Caching)    │
└──────────────────┘   └────────────────┘
```

## Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature/your-feature`
3. Commit changes: `git commit -am 'Add feature'`
4. Push to branch: `git push origin feature/your-feature`
5. Submit pull request

## License

MIT

## Support

For issues and questions:
- GitHub Issues: [your-repo-url]
- Documentation: [your-docs-url]

## Related Projects

- Smart Contract: `../sc-solana`
- Frontend: `../frontend` (coming soon)
- Mobile App: `../mobile` (coming soon)
