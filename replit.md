# Arcade Empire - Discord.js v14 Bot

## Project Overview
Arcade Empire is a sophisticated Discord bot built with Discord.js v14, featuring multiplayer minigames and a player-driven economy. The bot uses modern Discord Components V2 for all interactions and provides a premium gaming experience.

## Recent Changes
- **2024-09-24**: Complete bot implementation with dynamic command system, onboarding tutorial, dual currency system, Rock Paper Scissors game, and Tic-tac-toe game
- **2024-09-24**: Integrated Components V2 throughout all interactions for modern Discord UI
- **2024-09-24**: Implemented JSON-based database with user profiles and interaction locking

## Core Features

### 🎮 Games Available
1. **Rock Paper Scissors** (`/rps @user wager`)
   - Secret move selection via DMs
   - 1.85x payout for winners
   - 30-second challenge timeouts

2. **Tic-tac-toe** (`/tictactoe @user wager`) 
   - Real-time 3x3 interactive button grid
   - Turn-based gameplay with visual feedback
   - Win detection and tie handling

### 💰 Economy System
- **Arcade Tokens (AT)**: Primary currency with emoji `<:ArcadeTokens:1420147365213507686>`
- **Golden Joysticks (GJ)**: Premium currency with emoji `<:GoldenJoysticks:1420147415868244148>`
- Starting balance: 1,000 AT and 0 GJ
- Winner gets 1.85x payout, 15% Arcade Fee for economy balance

### 🎯 User System
- **Onboarding Tutorial**: Interactive Components V2 tutorial for new users
- **Balance Command**: `/balance [user]` to check currency with beautiful formatting
- **Game Statistics**: Track games played, games won, win rate
- **Interaction Locking**: Prevents users from starting multiple games simultaneously

## Project Architecture

### Core Files
- `index.js`: Dynamic command handler with automatic global slash command registration
- `commands/balance.js`: Balance checking and onboarding tutorial system
- `commands/rps.js`: Rock Paper Scissors game implementation
- `commands/tictactoe.js`: Tic-tac-toe game implementation
- `data/users.json`: JSON-based user database (auto-created)

### Technical Requirements Met
✅ Discord.js v14 with Components V2 everywhere  
✅ Dynamic command loading (never modify index.js)  
✅ Global slash command registration (integrated, no separate script)  
✅ Interaction locking system with ephemeral error messages  
✅ JSON database (no external dependencies)  
✅ Replit Secrets integration (BOT_TOKEN, CLIENT_ID)  
✅ 30-second challenge timeouts  
✅ 1.85x payout system with 15% arcade fee  
✅ All responses use embeds with Components V2  

### Database Schema
```json
{
  "userId": {
    "id": "string",
    "username": "string", 
    "arcadeTokens": "number",
    "goldenJoysticks": "number",
    "onboarded": "boolean",
    "gamesPlayed": "number",
    "gamesWon": "number",
    "createdAt": "timestamp"
  }
}
```

## User Workflow
1. New user triggers any command → Mandatory onboarding tutorial
2. Tutorial explains currencies, gameplay, payouts via interactive Components V2
3. User gets starting balance: 1,000 AT, 0 GJ
4. User can check balances with `/balance [user]`
5. User challenges others: `/rps @user 100` or `/tictactoe @user 50`
6. Both players confirm → Game starts → Payouts distributed

## Game Flow
1. **Challenge Phase**: Challenger confirms → Opponent confirms (30s timeouts)
2. **Wager Deduction**: Tokens held in escrow during game
3. **Gameplay**: RPS via secret DMs, Tic-tac-toe via interactive grid
4. **Resolution**: Winner gets 1.85x, loser loses wager, 15% arcade fee
5. **Stats Update**: Games played/won tracking

## Environment Setup
- Requires `BOT_TOKEN` and `CLIENT_ID` in Replit Secrets
- Node.js 16+ with discord.js v14
- No external databases or dependencies beyond discord.js

## Bot Status
🟢 **ONLINE** - Bot "Breaking Bad#1302" serving 1 guild with 3 registered slash commands

## Next Phase Features
- Additional multiplayer games (Connect Four, Blackjack, Coin Flip)
- Leaderboards and comprehensive statistics
- Golden Joysticks earning mechanics  
- Daily rewards and streak systems
- Tournament brackets for multiple players