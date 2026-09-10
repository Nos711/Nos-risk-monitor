# NØS Trading System OS

A separate systematic-trading support app focused on decision quality, portfolio risk, correlated exposure, profit giveback and execution discipline.

## Core workflow
1. Set portfolio rules and daily limits.
2. Run every candidate trade through the Pre-Trade Gate.
3. Only add positions when the gate returns TRADE ALLOWED or a reviewed CAUTION.
4. Monitor total open risk, correlated exposure and daily P&L giveback.
5. Score execution independently from P&L.

## Current MVP
- Pre-Trade Gate: TRADE ALLOWED / CAUTION / NO TRADE
- Risk-per-trade sizing from equity and stop distance
- Total portfolio risk control
- Max open-position rule
- Correlation rule
- Daily-loss kill switch
- Peak P&L / current P&L / giveback tracking
- Mental-state and confidence checks
- Risk Added After Profit warning
- Portfolio exposure table
- 5-point execution score
- Browser persistence with localStorage

## Data note
This first version intentionally uses browser localStorage so it is completely isolated from the existing NØS Trading Monitor and cannot modify its database. A later version can add a dedicated Supabase project for cross-device sync and analytics.

Deployment trigger: Git-connected production build.
