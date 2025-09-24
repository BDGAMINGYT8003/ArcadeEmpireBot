const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');
const DatabaseManager = require('../utils/DatabaseManager');

const AT_EMOJI = '<:ArcadeTokens:1420147365213507686>';
const WAGER_MIN = 1;
const WAGER_MAX = 25000;

// Helper to create a consistent game container
const createGameContainer = (accentColor, content) => {
    return new ContainerBuilder()
        .setAccentColor(accentColor)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rps')
        .setDescription('Challenge a player to Rock, Paper, Scissors.')
        .addUserOption(option => option.setName('opponent').setDescription('The player you want to challenge.').setRequired(true))
        .addIntegerOption(option => option.setName('wager').setDescription(`The amount of AT to wager (min: ${WAGER_MIN}, max: ${WAGER_MAX}).`).setRequired(true).setMinValue(WAGER_MIN).setMaxValue(WAGER_MAX)),

    async execute(interaction, client) {
        const initiator = interaction.user;
        const opponent = interaction.options.getUser('opponent');
        const wager = interaction.options.getInteger('wager');

        if (opponent.id === initiator.id || opponent.bot) return interaction.reply({ components: [createGameContainer(0xff6b6b, '❌ You cannot challenge yourself or a bot!')], flags: MessageFlags.IsComponentsV2, ephemeral: true });
        const initiatorProfile = DatabaseManager.getUser(initiator.id);
        const opponentProfile = DatabaseManager.getUser(opponent.id);
        if (!opponentProfile || !opponentProfile.onboarded) return interaction.reply({ components: [createGameContainer(0xff6b6b, `❌ \`${opponent.username}\` hasn't completed the tutorial yet!`)], flags: MessageFlags.IsComponentsV2, ephemeral: true });
        if (initiatorProfile.arcadeTokens < wager || opponentProfile.arcadeTokens < wager) return interaction.reply({ components: [createGameContainer(0xff6b6b, '❌ One or both players do not have enough tokens for this wager!')], flags: MessageFlags.IsComponentsV2, ephemeral: true });

        const challengeMessage = await interaction.channel.send({ content: 'Creating challenge...' });
        await interaction.reply({ content: 'Challenge created!', ephemeral: true });

        client.activeUsers.add(initiator.id);
        client.activeUsers.add(opponent.id);

        client.pendingGames.set(challengeMessage.id, {
            command: 'rps',
            initiatorId: initiator.id,
            opponentId: opponent.id,
            wager: wager,
            status: 'pending_initiator',
            choices: {}
        });

        const confirmButton = new ButtonBuilder().setCustomId(`rps_confirm_${challengeMessage.id}`).setLabel('Confirm Challenge').setStyle(ButtonStyle.Success);
        const declineButton = new ButtonBuilder().setCustomId(`rps_decline_${challengeMessage.id}`).setLabel('Cancel').setStyle(ButtonStyle.Danger);
        const row = new ActionRowBuilder().addComponents(confirmButton, declineButton);
        const challengeContainer = createGameContainer(0xfb923c, `**RPS Challenge!**\n\n${initiator}, you are challenging ${opponent} for **${wager.toLocaleString()}** ${AT_EMOJI}.\n\nPlease confirm.`);

        await challengeMessage.edit({ content: `${initiator}`, components: [challengeContainer, row], flags: MessageFlags.IsComponentsV2 });

        const collector = challengeMessage.createMessageComponentCollector({ time: 30000 });
        collector.on('end', (collected, reason) => {
            const game = client.pendingGames.get(challengeMessage.id);
            if (game && game.status === 'pending_initiator') {
                client.activeUsers.delete(initiator.id);
                client.activeUsers.delete(opponent.id);
                client.pendingGames.delete(challengeMessage.id);
                challengeMessage.edit({ content: ' ', components: [createGameContainer(0x71717a, `**Challenge Canceled**\n\n${initiator.username} did not respond.`)] });
            }
        });
    },

    async handleButton(interaction, client) {
        const [command, action, ...args] = interaction.customId.split('_');
        const messageId = action === 'move' ? args[1] : args[0];
        const game = client.pendingGames.get(messageId);

        if (!game) return interaction.update({ content: 'This game has expired or could not be found.', components: [] });

        const cleanup = () => {
            client.activeUsers.delete(game.initiatorId);
            client.activeUsers.delete(game.opponentId);
            client.pendingGames.delete(messageId);
        };

        if (action === 'decline') {
            if (interaction.user.id !== game.initiatorId && interaction.user.id !== game.opponentId) return;
            const decliner = await client.users.fetch(interaction.user.id);
            cleanup();
            return interaction.update({ content: ' ', components: [createGameContainer(0x71717a, `**Challenge Canceled**\n\n${decliner.username} declined the challenge.`)] });
        }

        if (action === 'confirm' && interaction.user.id === game.initiatorId) {
            game.status = 'pending_opponent';
            const opponent = await client.users.fetch(game.opponentId);
            const acceptButton = new ButtonBuilder().setCustomId(`rps_accept_${messageId}`).setLabel('Accept').setStyle(ButtonStyle.Success);
            const declineButton = new ButtonBuilder().setCustomId(`rps_decline_${messageId}`).setLabel('Decline').setStyle(ButtonStyle.Danger);
            const row = new ActionRowBuilder().addComponents(acceptButton, declineButton);
            const opponentContainer = createGameContainer(0xfb923c, `**RPS Challenge!**\n\n${opponent}, you have been challenged by <@${game.initiatorId}> for **${game.wager.toLocaleString()}** ${AT_EMOJI}.`);

            await interaction.update({ content: `${opponent}`, components: [opponentContainer, row] });

            const collector = interaction.message.createMessageComponentCollector({ time: 30000 });
            collector.on('end', (collected, reason) => {
                const currentGame = client.pendingGames.get(messageId);
                if (currentGame && currentGame.status === 'pending_opponent') {
                    cleanup();
                    interaction.editReply({ content: ' ', components: [createGameContainer(0x71717a, `**Challenge Canceled**\n\n${opponent.username} did not respond.`)] });
                }
            });
            return;
        }

        if (action === 'accept' && interaction.user.id === game.opponentId) {
            game.status = 'active';
            DatabaseManager.updateBalance(game.initiatorId, -game.wager);
            DatabaseManager.updateBalance(game.opponentId, -game.wager);

            const initiator = await client.users.fetch(game.initiatorId);
            const opponent = await client.users.fetch(game.opponentId);

            const gameContainer = createGameContainer(0x38bdf8, `**Game On!**\n\n${initiator.username} vs. ${opponent.username}\n\nCheck your DMs to make your move secretly!`);
            await interaction.update({ content: ' ', components: [gameContainer] });

            const moveRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`rps_move_rock_${messageId}`).setLabel('Rock').setStyle(ButtonStyle.Secondary).setEmoji('🪨'),
                new ButtonBuilder().setCustomId(`rps_move_paper_${messageId}`).setLabel('Paper').setStyle(ButtonStyle.Secondary).setEmoji('📄'),
                new ButtonBuilder().setCustomId(`rps_move_scissors_${messageId}`).setLabel('Scissors').setStyle(ButtonStyle.Secondary).setEmoji('✂️')
            );

            const movePrompt = { components: [moveRow], content: 'Choose your move for the RPS game:' };

            // Send the move prompt to both players via DMs
            try {
                await initiator.send(movePrompt);
                await opponent.send(movePrompt);
            } catch (error) {
                console.error("Could not DM players for RPS game.", error);
                // If DMs fail, we can't really proceed with a secret game. Cancel it.
                const errorContainer = createGameContainer(0xff6b6b, `**Game Canceled**\n\nCould not send DMs to one or both players. Please ensure your DMs are open for this server.`);
                await interaction.message.edit({ components: [errorContainer] });
                // Refund players
                DatabaseManager.updateBalance(game.initiatorId, game.wager);
                DatabaseManager.updateBalance(game.opponentId, game.wager);
                cleanup();
            }
        }

        if (action === 'move') {
            if (interaction.user.id !== game.initiatorId && interaction.user.id !== game.opponentId) return;
            const choice = args[0];
            if (game.choices[interaction.user.id]) return interaction.reply({ content: `You have already chosen.`, ephemeral: true });

            game.choices[interaction.user.id] = choice;
            await interaction.reply({ content: `You chose **${choice}**. Waiting for the other player...`, ephemeral: true });

            if (Object.keys(game.choices).length === 2) {
                const initiator = await client.users.fetch(game.initiatorId);
                const opponent = await client.users.fetch(game.opponentId);
                const iChoice = game.choices[game.initiatorId];
                const oChoice = game.choices[game.opponentId];
                let resultText, winnerId = null;

                if (iChoice === oChoice) {
                    resultText = `It's a **Tie!** Both players chose ${iChoice}.`;
                    DatabaseManager.updateBalance(game.initiatorId, game.wager);
                    DatabaseManager.updateBalance(game.opponentId, game.wager);
                } else if ((iChoice === 'rock' && oChoice === 'scissors') || (iChoice === 'paper' && oChoice === 'rock') || (iChoice === 'scissors' && oChoice === 'paper')) {
                    winnerId = game.initiatorId;
                    resultText = `${initiator.username}'s ${iChoice} beats ${opponent.username}'s ${oChoice}.`;
                } else {
                    winnerId = game.opponentId;
                    resultText = `${opponent.username}'s ${oChoice} beats ${initiator.username}'s ${iChoice}.`;
                }

                let finalContainer;
                if (winnerId) {
                    const payout = Math.floor(game.wager * 1.85);
                    DatabaseManager.updateBalance(winnerId, game.wager + payout);
                    const winnerData = DatabaseManager.getUser(winnerId);
                    DatabaseManager.updateUser(winnerId, { gamesWon: winnerData.gamesWon + 1 });
                    finalContainer = createGameContainer(0x22c55e, `**Game Over!**\n\n${resultText}\n\n**<@${winnerId}> wins ${payout.toLocaleString()} ${AT_EMOJI}!**`);
                } else {
                    finalContainer = createGameContainer(0x71717a, `**Game Over!**\n\n${resultText}\n\nWagers have been returned.`);
                }

                const initiatorData = DatabaseManager.getUser(game.initiatorId);
                const opponentData = DatabaseManager.getUser(game.opponentId);
                DatabaseManager.updateUser(game.initiatorId, { gamesPlayed: initiatorData.gamesPlayed + 1 });
                DatabaseManager.updateUser(game.opponentId, { gamesPlayed: opponentData.gamesPlayed + 1 });

                await interaction.message.edit({ content: ' ', components: [finalContainer], flags: MessageFlags.IsComponentsV2 });
                cleanup();
            }
        }
    },
};
