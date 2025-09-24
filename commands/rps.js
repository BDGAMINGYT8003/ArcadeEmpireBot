const { SlashCommandBuilder, ContainerBuilder, SectionBuilder, TextDisplayBuilder, SeparatorBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

// Game state storage
const activeGames = new Map();
const pendingChallenges = new Map();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rps')
        .setDescription('Challenge another player to Rock Paper Scissors')
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
            .setCustomId(`rps_challenger_accept_${challengeId}`)
            .setLabel('Yes, Challenge!')
            .setStyle(ButtonStyle.Success)
            .setEmoji('✅');

        const declineButton = new ButtonBuilder()
            .setCustomId(`rps_challenger_decline_${challengeId}`)
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
                    .setContent(`**🎯 Rock Paper Scissors Challenge**\n\n${challenger.username} wants to challenge ${opponent.username}!`)
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
        const parts = interaction.customId.split('_');
        const action = parts[1];
        
        if (action === 'challenger' || action === 'opponent') {
            const role = parts[1];
            const status = parts[2];
            const challengeId = parts.slice(3).join('_');
            
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
                        .setCustomId(`rps_opponent_accept_${challengeId}`)
                        .setLabel('Accept Challenge!')
                        .setStyle(ButtonStyle.Success)
                        .setEmoji('⚔️');

                    const declineButton = new ButtonBuilder()
                        .setCustomId(`rps_opponent_decline_${challengeId}`)
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
                                .setContent(`**🎯 Rock Paper Scissors Challenge**\n\n${challengeData.challenger.username} has challenged you to Rock Paper Scissors!`)
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
        
        // Game moves
        else if (action === 'move') {
            const move = parts[2];
            const challengeId = parts.slice(3).join('_');
            return this.handleMove(interaction, challengeId, move, client, DatabaseManager);
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
        activeGames.set(challengeId, {
            ...challengeData,
            moves: {},
            step: 'playing'
        });
        pendingChallenges.delete(challengeId);

        // Update main message
        const gameContainer = new ContainerBuilder()
            .setAccentColor(0x8b5cf6)
            .addTextDisplayComponents(
                new TextDisplayBuilder()
                    .setContent(`**⚔️ Rock Paper Scissors Battle**\n\n${challengeData.challenger.username} vs ${challengeData.opponent.username}`)
            )
            .addSeparatorComponents(new SeparatorBuilder())
            .addTextDisplayComponents(
                new TextDisplayBuilder()
                    .setContent(`**💰 Wager:** <:ArcadeTokens:1420147365213507686> ${challengeData.wager.toLocaleString()} AT each\n\nBoth players, check your DMs to make your secret moves!`)
            );

        await interaction.update({
            components: [gameContainer],
            flags: MessageFlags.IsComponentsV2
        });

        // Send DMs to both players
        await this.sendMoveOptions(challengeData.challenger, challengeId);
        await this.sendMoveOptions(challengeData.opponent, challengeId);
    },

    async sendMoveOptions(user, challengeId) {
        try {
            const rockButton = new ButtonBuilder()
                .setCustomId(`rps_move_rock_${challengeId}`)
                .setLabel('Rock')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('🪨');

            const paperButton = new ButtonBuilder()
                .setCustomId(`rps_move_paper_${challengeId}`)
                .setLabel('Paper')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('📄');

            const scissorsButton = new ButtonBuilder()
                .setCustomId(`rps_move_scissors_${challengeId}`)
                .setLabel('Scissors')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('✂️');

            const moveContainer = new ContainerBuilder()
                .setAccentColor(0x8b5cf6)
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(`**🎮 Make Your Move**\n\nChoose your move for Rock Paper Scissors!\nThis message is private - only you can see it.`)
                )
                .addActionRowComponents(
                    new ActionRowBuilder().addComponents(rockButton, paperButton, scissorsButton)
                );

            await user.send({
                components: [moveContainer],
                flags: MessageFlags.IsComponentsV2
            });
        } catch (error) {
            console.error(`Failed to send DM to ${user.username}:`, error);
        }
    },

    async handleMove(interaction, challengeId, move, client, DatabaseManager) {
        const gameData = activeGames.get(challengeId);
        if (!gameData) {
            return this.sendError(interaction, 'This game has expired or ended.', true);
        }

        // Record the move
        gameData.moves[interaction.user.id] = move;
        
        // Acknowledge the move privately
        const moveAckContainer = new ContainerBuilder()
            .setAccentColor(0x10b981)
            .addTextDisplayComponents(
                new TextDisplayBuilder()
                    .setContent(`**✅ Move Recorded**\n\nYou chose **${move.charAt(0).toUpperCase() + move.slice(1)}**!\nWaiting for your opponent...`)
            );

        await interaction.update({
            components: [moveAckContainer],
            flags: MessageFlags.IsComponentsV2
        });

        // Check if both players have moved
        if (Object.keys(gameData.moves).length === 2) {
            await this.resolveGame(gameData, challengeId, client, DatabaseManager);
        }
    },

    async resolveGame(gameData, challengeId, client, DatabaseManager) {
        const challengerMove = gameData.moves[gameData.challenger.id];
        const opponentMove = gameData.moves[gameData.opponent.id];
        
        const winner = this.determineWinner(challengerMove, opponentMove);
        const payout = Math.floor(gameData.wager * 1.85);
        
        let winnerUser, loserUser, result;
        
        if (winner === 'challenger') {
            winnerUser = gameData.challenger;
            loserUser = gameData.opponent;
            result = `${gameData.challenger.username} wins!`;
        } else if (winner === 'opponent') {
            winnerUser = gameData.opponent;
            loserUser = gameData.challenger;
            result = `${gameData.opponent.username} wins!`;
        } else {
            result = 'It\'s a tie!';
        }

        // Update balances and stats
        if (winner !== 'tie') {
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

        // Create result message
        const movesSection = new SectionBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder()
                    .setContent(`**${gameData.challenger.username}:** ${this.getMoveEmoji(challengerMove)} ${challengerMove.charAt(0).toUpperCase() + challengerMove.slice(1)}\n**${gameData.opponent.username}:** ${this.getMoveEmoji(opponentMove)} ${opponentMove.charAt(0).toUpperCase() + opponentMove.slice(1)}`)
            );

        const resultContainer = new ContainerBuilder()
            .setAccentColor(winner === 'tie' ? 0x6b7280 : 0x10b981)
            .addTextDisplayComponents(
                new TextDisplayBuilder()
                    .setContent(`**🏆 Rock Paper Scissors Results**\n\n${result}`)
            )
            .addSeparatorComponents(new SeparatorBuilder())
            .addSectionComponents(movesSection);

        if (winner !== 'tie') {
            resultContainer.addSeparatorComponents(new SeparatorBuilder())
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(`**💰 Payout:** <:ArcadeTokens:1420147365213507686> ${payout.toLocaleString()} AT to ${winnerUser.username}`)
                );
        }

        // Send result to both players via DM
        try {
            await gameData.challenger.send({
                components: [resultContainer],
                flags: MessageFlags.IsComponentsV2
            });
            await gameData.opponent.send({
                components: [resultContainer],
                flags: MessageFlags.IsComponentsV2
            });
        } catch (error) {
            console.error('Error sending game results:', error);
        }

        // Clean up
        activeGames.delete(challengeId);
        client.activeUsers.delete(gameData.challenger.id);
        client.activeUsers.delete(gameData.opponent.id);
    },

    determineWinner(move1, move2) {
        if (move1 === move2) return 'tie';
        
        const winConditions = {
            rock: 'scissors',
            paper: 'rock',
            scissors: 'paper'
        };
        
        return winConditions[move1] === move2 ? 'challenger' : 'opponent';
    },

    getMoveEmoji(move) {
        const emojis = { rock: '🪨', paper: '📄', scissors: '✂️' };
        return emojis[move] || '❓';
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