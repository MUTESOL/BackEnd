# Database Setup Guide

## Files

- `schema.sql` - Creates all tables, indexes, and functions (FIXED ✅)
- `reset.sql` - Drops all tables for a fresh start (⚠️ WARNING: Deletes all data!)

## Setup Instructions

### First Time Setup

1. **Create the database:**
```bash
createdb mutesol
```

2. **Run the schema:**
```bash
psql -U postgres -d mutesol -f db/schema.sql
```

### Reset Database (if needed)

If you need to start fresh or fix errors:

1. **Drop all tables:**
```bash
psql -U postgres -d mutesol -f db/reset.sql
```

2. **Recreate tables:**
```bash
psql -U postgres -d mutesol -f db/schema.sql
```

### One-Line Reset & Recreate

```bash
psql -U postgres -d mutesol -f db/reset.sql && psql -U postgres -d mutesol -f db/schema.sql
```

## Verification

After running the schema, verify all tables were created:

```bash
psql -U postgres -d mutesol -c "\dt"
```

You should see:
- users
- goals
- transactions
- faucet_claims
- daily_analytics
- currency_configs

Check indexes:
```bash
psql -U postgres -d mutesol -c "\di"
```

## Tables Overview

| Table | Purpose |
|-------|---------|
| `users` | User accounts and statistics |
| `goals` | Savings goals with targets |
| `transactions` | Transaction logs (deposits, withdrawals) |
| `faucet_claims` | Faucet usage tracking |
| `daily_analytics` | Daily aggregated statistics |
| `currency_configs` | Currency configurations (USDC, IDRX) |

## Common Issues

### "password authentication failed"
Make sure your PostgreSQL password is correct in `.env`

### "database does not exist"
Run `createdb mutesol` first

### "permission denied"
Make sure you have PostgreSQL admin access
