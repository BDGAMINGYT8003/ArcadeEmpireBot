const { SlashCommandBuilder, ContainerBuilder, SectionBuilder, TextDisplayBuilder, SeparatorBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

// Game state storage
const activeGames = new Map();
const pendingChallenges = new Map();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('tictactoe')
        .setDescription('Challenge another player to Tic-tac-toe')
        .addUserOption(option =>
            option.setName('opponent')
                .setDescription('The player you want to challenge')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('wager')
                .setDescription('Amount of Arcade Tokens to wager (1-25,000)')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(25000)),

    async execute(interaction, client, DatabaseManager) {
        const challenger = interaction.user;
        const opponent = interaction.options.getUser('opponent');
        const wager = interaction.options.getInteger('wager');

        // Basic validation
        if (opponent.id === challenger.id) {
            return this.sendError(interaction, 'You cannot challenge yourself to a game!');
        }

        if (opponent.bot) {
            return this.sendError(interaction, 'You cannot challenge bots to games!');
        }

        // Check if users have profiles and are onboarded
        const challengerProfile = DatabaseManager.getUser(challenger.id);
        const opponentProfile = DatabaseManager.getUser(opponent.id);

        if (!challengerProfile || !challengerProfile.onboarded) {
            return this.sendError(interaction, 'You need to complete the tutorial first! Use `/balance` to get started.');
        }

        if (!opponentProfile || !opponentProfile.onboarded) {
            return this.sendError(interaction, `${opponent.username} hasn't joined Arcade Empire yet! They need to use any command to get started.`);
        }

        // Check if challenger has enough tokens
        if (challengerProfile.arcadeTokens < wager) {
            return this.sendError(interaction, `You don't have enough Arcade Tokens! You have ${challengerProfile.arcadeTokens} AT but need ${wager} AT.`);
        }

        // Check if opponent has enough tokens
        if (opponentProfile.arcadeTokens < wager) {
            return this.sendError(interaction, `${opponent.username} doesn't have enough Arcade Tokens! They have ${opponentProfile.arcadeTokens} AT but need ${wager} AT.`);
        }

        // Check if users are already in games
        if (client.activeUsers.has(challenger.id)) {
            return this.sendError(interaction, 'You are already in an active command. Please complete or cancel it before starting a new one.');
        }

        if (client.activeUsers.has(opponent.id)) {
            return this.sendError(interaction, `${opponent.username} is already in an active game. Please wait for them to finish.`);
        }

        // Add both users to active users
        client.activeUsers.add(challenger.id);
        client.activeUsers.add(opponent.id);

        // Create challenge
        const challengeId = `${challenger.id}_${opponent.id}_${Date.now()}`;
        const challengeData = {
            challenger: challenger,
            opponent: opponent,
            wager: wager,
            step: 'challenger_confirm'
        };

        pendingChallenges.set(challengeId, challengeData);

        // Send challenger confirmation
        const arcadeTokenEmoji = '<:ArcadeTokens:1420147365213507686>';

        const acceptButton = new ButtonBuilder()
            .setCustomId(`tictactoe_challenger_accept_${challengeId}`)
            .setLabel('Yes, Challenge!')
            .setStyle(ButtonStyle.Success)
            .setEmoji('✅');

        const declineButton = new ButtonBuilder()
            .setCustomId(`tictactoe_challenger_decline_${challengeId}`)
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('❌');

        const wagerSection = new SectionBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder()
                    .setContent(`**💰 Wager:** ${arcadeTokenEmoji} ${wager.toLocaleString()} AT\n**🏆 Winner Gets:** ${arcadeTokenEmoji} ${Math.floor(wager * 1.85).toLocaleString()} AT\n\n**${challenger.username}, confirm your challenge:**`)
            );

        const challengeContainer = new ContainerBuilder()
            .setAccentColor(0xf59e0b)
            .addTextDisplayComponents(
                new TextDisplayBuilder()
                    .setContent(`**🎯 Tic-tac-toe Challenge**\n\n${challenger.username} wants to challenge ${opponent.username}!`)
            )
            .addSeparatorComponents(new SeparatorBuilder())
            .addSectionComponents(wagerSection)
            .addActionRowComponents(
                new ActionRowBuilder().addComponents(acceptButton, declineButton)
            );

        const response = await interaction.reply({
            components: [challengeContainer],
            flags: MessageFlags.IsComponentsV2
        });

        // Set 30-second timeout for challenger response
        setTimeout(() => this.timeoutChallenge(challengeId, client, response), 30000);
    },

    async handleButton(interaction, client, DatabaseManager) {
        const customIdParts = interaction.customId.split('_');
        const action = customIdParts[1];

        if (action === 'challenger' || action === 'opponent') {
            const role = action;
            const status = customIdParts[2];
            const challengeId = customIdParts.slice(3).join('_');

            const challengeData = pendingChallenges.get(challengeId);

            if (!challengeData) {
                return this.sendError(interaction, 'This challenge has expired or been cancelled.', true);
            }

            // Challenger confirmation
            if (role === 'challenger' && interaction.user.id === challengeData.challenger.id) {
                if (status === 'decline') {
                    return this.cancelChallenge(interaction, challengeId, client, 'Challenger cancelled the challenge.');
                }

                if (status === 'accept') {
                    challengeData.step = 'opponent_confirm';

                    const arcadeTokenEmoji = '<:ArcadeTokens:1420147365213507686>';

                    const acceptButton = new ButtonBuilder()
                        .setCustomId(`tictactoe_opponent_accept_${challengeId}`)
                        .setLabel('Accept Challenge!')
                        .setStyle(ButtonStyle.Success)
                        .setEmoji('⚔️');

                    const declineButton = new ButtonBuilder()
                        .setCustomId(`tictactoe_opponent_decline_${challengeId}`)
                        .setLabel('Decline')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji('❌');

                    const wagerSection = new SectionBuilder()
                        .addTextDisplayComponents(
                            new TextDisplayBuilder()
                                .setContent(`**💰 Wager:** ${arcadeTokenEmoji} ${challengeData.wager.toLocaleString()} AT\n**🏆 Winner Gets:** ${arcadeTokenEmoji} ${Math.floor(challengeData.wager * 1.85).toLocaleString()} AT\n\n**${challengeData.opponent.username}, do you accept?**`)
                        );

                    const opponentContainer = new ContainerBuilder()
                        .setAccentColor(0xf59e0b)
                        .addTextDisplayComponents(
                            new TextDisplayBuilder()
                                .setContent(`**🎯 Tic-tac-toe Challenge**\n\n${challengeData.challenger.username} has challenged you to Tic-tac-toe!`)
                        )
                        .addSeparatorComponents(new SeparatorBuilder())
                        .addSectionComponents(wagerSection)
                        .addComponents(
                            new ActionRowBuilder().addComponents(acceptButton, declineButton))
                        );

                    await interaction.update({
                        components: [opponentContainer],
                        flags: MessageFlags.IsComponentsV2
                    });

                    // Set timeout for opponent response
                    setTimeout(() => this.timeoutChallenge(challengeId, client, interaction), 30000);
                }
            }

            // Opponent response
            else if (role === 'opponent' && interaction.user.id === challengeData.opponent.id) {
                if (status === 'decline') {
                    return this.cancelChallenge(interaction, challengeId, client, `${challengeData.opponent.username} declined the challenge.`);
                }

                if (status === 'accept') {
                    return this.startGame(interaction, challengeId, client, DatabaseManager);
                }
            }
        }

        // Handle game moves
        else if (action === 'move') {
            const position = parseInt(customIdParts[2]);
            const challengeId = customIdParts.slice(3).join('_');
            return this.handleMove(interaction, challengeId, position, client, DatabaseManager);
        }
    },

    async startGame(interaction, challengeId, client, DatabaseManager) {
        const challengeData = pendingChallenges.get(challengeId);

        // Deduct wagers from both players
        DatabaseManager.updateUser(challengeData.challenger.id, {
            arcadeTokens: DatabaseManager.getUser(challengeData.challenger.id).arcadeTokens - challengeData.wager
        });

        DatabaseManager.updateUser(challengeData.opponent.id, {
            arcadeTokens: DatabaseManager.getUser(challengeData.opponent.id).arcadeTokens - challengeData.wager
        });

        // Move to active games
        const gameData = {
            ...challengeData,
            board: Array(9).fill(null), // 3x3 grid
            currentPlayer: challengeData.challenger.id, // Challenger goes first (X)
            step: 'playing',
            interaction: interaction
        };

        activeGames.set(challengeId, gameData);
        pendingChallenges.delete(challengeId);

        // Update main message with game board
        await this.updateGameBoard(interaction, challengeId, gameData);
    },

    async updateGameBoard(interaction, challengeId, gameData) {
        const board = gameData.board;
        const currentPlayerName = gameData.currentPlayer === gameData.challenger.id 
            ? gameData.challenger.username 
            : gameData.opponent.username;

        const currentPlayerSymbol = gameData.currentPlayer === gameData.challenger.id ? 'X' : 'O';

        const gameContainer = new ContainerBuilder()
            .setAccentColor(0x8b5cf6)
            .addTextDisplayComponents(
                new TextDisplayBuilder()
                    .setContent(`**⚔️ Tic-tac-toe Battle**\n\n${gameData.challenger.username} (❌) vs ${gameData.opponent.username} (⭕)`)
            )
            .addSeparatorComponents(new SeparatorBuilder())
            .addTextDisplayComponents(
                new TextDisplayBuilder()
                    .setContent(`**🎯 Current Turn:** ${currentPlayerName} (${currentPlayerSymbol === 'X' ? '❌' : '⭕'})`)
            );

        // Add three rows of buttons for the game board
        for (let row = 0; row < 3; row++) {
            const rowButtons = [];

            for (let col = 0; col < 3; col++) {
                const position = row * 3 + col;
                const cellValue = board[position];

                let label, style, disabled;

                if (cellValue === null) {
                    label = '⬜';
                    style = ButtonStyle.Secondary;
                    disabled = gameData.currentPlayer !== interaction.user.id;
                } else if (cellValue === 'X') {
                    label = '❌';
                    style = ButtonStyle.Danger;
                    disabled = true;
                } else {
                    label = '⭕';
                    style = ButtonStyle.Primary;
                    disabled = true;
                }

                const button = new ButtonBuilder()
                    .setCustomId(`tictactoe_move_${position}_${challengeId}`)
                    .setLabel(label)
                    .setStyle(style)
                    .setDisabled(disabled);

                rowButtons.push(button);
            }

            gameContainer.addComponents(
                new ActionRowBuilder().addComponents(...rowButtons)
            );
        }

        await interaction.update({
            components: [gameContainer],
            flags: MessageFlags.IsComponentsV2
        });
    },

    async handleMove(interaction, challengeId, position, client, DatabaseManager) {
        const gameData = activeGames.get(challengeId);
        if (!gameData) {
            return this.sendError(interaction, 'This game has expired or ended.', true);
        }

        // Verify it's the player's turn
        if (interaction.user.id !== gameData.currentPlayer) {
            return this.sendError(interaction, 'It\'s not your turn!', true);
        }

        // Verify position is empty
        if (gameData.board[position] !== null) {
            return this.sendError(interaction, 'That position is already taken!', true);
        }

        // Make the move
        const symbol = gameData.currentPlayer === gameData.challenger.id ? 'X' : 'O';
        gameData.board[position] = symbol;

        // Check for win or tie
        const winner = this.checkWinner(gameData.board);

        if (winner || this.isBoardFull(gameData.board)) {
            await this.endGame(interaction, challengeId, winner, client, DatabaseManager);
        } else {
            // Switch turns
            gameData.currentPlayer = gameData.currentPlayer === gameData.challenger.id 
                ? gameData.opponent.id 
                : gameData.challenger.id;

            await this.updateGameBoard(interaction, challengeId, gameData);
        }
    },

    async endGame(interaction, challengeId, winner, client, DatabaseManager) {
        const gameData = activeGames.get(challengeId);
        const payout = Math.floor(gameData.wager * 1.85);

        let winnerUser, loserUser, result;

        if (winner === 'X') {
            winnerUser = gameData.challenger;
            loserUser = gameData.opponent;
            result = `${gameData.challenger.username} wins! ❌`;
        } else if (winner === 'O') {
            winnerUser = gameData.opponent;
            loserUser = gameData.challenger;
            result = `${gameData.opponent.username} wins! ⭕`;
        } else {
            result = 'It\'s a tie! 🤝';
        }

        // Update balances and stats
        if (winner) {
            DatabaseManager.updateUser(winnerUser.id, {
                arcadeTokens: DatabaseManager.getUser(winnerUser.id).arcadeTokens + payout,
                gamesWon: DatabaseManager.getUser(winnerUser.id).gamesWon + 1,
                gamesPlayed: DatabaseManager.getUser(winnerUser.id).gamesPlayed + 1
            });
            DatabaseManager.updateUser(loserUser.id, {
                gamesPlayed: DatabaseManager.getUser(loserUser.id).gamesPlayed + 1
            });
        } else {
            // Return wagers on tie
            DatabaseManager.updateUser(gameData.challenger.id, {
                arcadeTokens: DatabaseManager.getUser(gameData.challenger.id).arcadeTokens + gameData.wager,
                gamesPlayed: DatabaseManager.getUser(gameData.challenger.id).gamesPlayed + 1
            });
            DatabaseManager.updateUser(gameData.opponent.id, {
                arcadeTokens: DatabaseManager.getUser(gameData.opponent.id).arcadeTokens + gameData.wager,
                gamesPlayed: DatabaseManager.getUser(gameData.opponent.id).gamesPlayed + 1
            });
        }

        // Create result message with final board
        const boardSection = new SectionBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder()
                    .setContent(`**Final Board:**\n${this.formatBoard(gameData.board)}`)
            );

        const resultContainer = new ContainerBuilder()
            .setAccentColor(winner ? 0x10b981 : 0x6b7280)
            .addTextDisplayComponents(
                new TextDisplayBuilder()
                    .setContent(`**🏆 Tic-tac-toe Results**\n\n${result}`)
            )
            .addSeparatorComponents(new SeparatorBuilder())
            .addSectionComponents(boardSection);

        if (winner) {
            resultContainer.addSeparatorComponents(new SeparatorBuilder())
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(`**💰 Payout:** <:ArcadeTokens:1420147365213507686> ${payout.toLocaleString()} AT to ${winnerUser.username}`)
                );
        } else {
            resultContainer.addSeparatorComponents(new SeparatorBuilder())
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(`**💰 Wagers Returned:** <:ArcadeTokens:1420147365213507686> ${gameData.wager.toLocaleString()} AT to each player`)
                );
        }

        await interaction.update({
            components: [resultContainer],
            flags: MessageFlags.IsComponentsV2
        });

        // Clean up
        activeGames.delete(challengeId);
        client.activeUsers.delete(gameData.challenger.id);
        client.activeUsers.delete(gameData.opponent.id);
    },

    checkWinner(board) {
        const winningCombinations = [
            [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
            [0, 3, 6], [1, 4, 7], [2, 5, 8], // Columns
            [0, 4, 8], [2, 4, 6]             // Diagonals
        ];

        for (const combo of winningCombinations) {
            const [a, b, c] = combo;
            if (board[a] && board[a] === board[b] && board[a] === board[c]) {
                return board[a];
            }
        }

        return null;
    },

    isBoardFull(board) {
        return board.every(cell => cell !== null);
    },

    formatBoard(board) {
        let formatted = '';
        for (let i = 0; i < 9; i += 3) {
            formatted += board.slice(i, i + 3).map(cell => 
                cell === null ? '⬜' : cell === 'X' ? '❌' : '⭕'
            ).join('') + '\n';
        }
        return formatted;
    },

    async cancelChallenge(interaction, challengeId, client, reason) {
        const challengeData = pendingChallenges.get(challengeId);
        if (challengeData) {
            client.activeUsers.delete(challengeData.challenger.id);
            client.activeUsers.delete(challengeData.opponent.id);
            pendingChallenges.delete(challengeId);
        }

        const cancelContainer = new ContainerBuilder()
            .setAccentColor(0x6b7280)
            .addTextDisplayComponents(
                new TextDisplayBuilder()
                    .setContent(`**❌ Challenge Cancelled**\n\n${reason}`)
            );

        await interaction.update({
            components: [cancelContainer],
            flags: MessageFlags.IsComponentsV2
        });
    },

    async timeoutChallenge(challengeId, client, interaction) {
        const challengeData = pendingChallenges.get(challengeId);
        if (!challengeData) return;

        client.activeUsers.delete(challengeData.challenger.id);
        client.activeUsers.delete(challengeData.opponent.id);
        pendingChallenges.delete(challengeId);

        try {
            const timeoutContainer = new ContainerBuilder()
                .setAccentColor(0x6b7280)
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(`**⏰ Challenge Expired**\n\nThe challenge timed out after 30 seconds.`)
                );

            await interaction.editReply({
                components: [timeoutContainer],
                flags: MessageFlags.IsComponentsV2
            });
        } catch (error) {
            console.error('Error updating timeout message:', error);
        }
    },

    async sendError(interaction, message, isUpdate = false) {
        const errorContainer = new ContainerBuilder()
            .setAccentColor(0xff6b6b)
            .addTextDisplayComponents(
                new TextDisplayBuilder()
                    .setContent(`**🚫 Error**\n\n${message}`)
            );

        const options = {
            components: [errorContainer],
            flags: MessageFlags.IsComponentsV2,
            ephemeral: true
        };

        if (isUpdate) {
            await interaction.update(options);
        } else {
            await interaction.reply(options);
        }
    }
};