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

// Generates the action rows for the Tic Tac Toe board
const generateBoardComponents = (board, messageId, disabled = false) => {
    return Array.from({ length: 3 }, (_, i) => {
        const row = new ActionRowBuilder();
        for (let j = 0; j < 3; j++) {
            const button = new ButtonBuilder()
                .setCustomId(`tictactoe_play_${i}-${j}_${messageId}`)
                .setDisabled(disabled || board[i][j] !== null);

            if (board[i][j] === 'X') {
                button.setLabel('X').setStyle(ButtonStyle.Primary);
            } else if (board[i][j] === 'O') {
                button.setLabel('O').setStyle(ButtonStyle.Danger);
            } else {
                button.setLabel(' ').setStyle(ButtonStyle.Secondary);
            }
            row.addComponents(button);
        }
        return row;
    });
};

// Checks for a win or a draw
const checkGameState = (board) => {
    const lines = [
        [board[0][0], board[0][1], board[0][2]], [board[1][0], board[1][1], board[1][2]], [board[2][0], board[2][1], board[2][2]],
        [board[0][0], board[1][0], board[2][0]], [board[0][1], board[1][1], board[2][1]], [board[0][2], board[1][2], board[2][2]],
        [board[0][0], board[1][1], board[2][2]], [board[0][2], board[1][1], board[2][0]],
    ];
    for (const line of lines) {
        if (line[0] && line[0] === line[1] && line[0] === line[2]) return line[0];
    }
    if (board.flat().every(cell => cell !== null)) return 'Tie';
    return null;
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('tictactoe')
        .setDescription('Challenge a player to a game of Tic-Tac-Toe.')
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
            command: 'tictactoe',
            initiatorId: initiator.id,
            opponentId: opponent.id,
            wager: wager,
            status: 'pending_initiator'
        });

        const confirmButton = new ButtonBuilder().setCustomId(`tictactoe_confirm_${challengeMessage.id}`).setLabel('Confirm Challenge').setStyle(ButtonStyle.Success);
        const declineButton = new ButtonBuilder().setCustomId(`tictactoe_decline_${challengeMessage.id}`).setLabel('Cancel').setStyle(ButtonStyle.Danger);
        const row = new ActionRowBuilder().addComponents(confirmButton, declineButton);
        const challengeContainer = createGameContainer(0xfb923c, `**Tic-Tac-Toe Challenge!**\n\n${initiator}, you are challenging ${opponent} for **${wager.toLocaleString()}** ${AT_EMOJI}.\n\nPlease confirm.`);

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
        const messageId = action === 'play' ? args[1] : args[0];
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
            const acceptButton = new ButtonBuilder().setCustomId(`tictactoe_accept_${messageId}`).setLabel('Accept').setStyle(ButtonStyle.Success);
            const declineButton = new ButtonBuilder().setCustomId(`tictactoe_decline_${messageId}`).setLabel('Decline').setStyle(ButtonStyle.Danger);
            const row = new ActionRowBuilder().addComponents(acceptButton, declineButton);
            const opponentContainer = createGameContainer(0xfb923c, `**Tic-Tac-Toe Challenge!**\n\n${opponent}, you have been challenged by <@${game.initiatorId}> for **${game.wager.toLocaleString()}** ${AT_EMOJI}.`);

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

            const players = Math.random() < 0.5 ? [game.initiatorId, game.opponentId] : [game.opponentId, game.initiatorId];
            game.players = { 'X': players[0], 'O': players[1] };
            game.turn = 'X';
            game.board = Array(3).fill(null).map(() => Array(3).fill(null));

            const turnUser = await client.users.fetch(game.players[game.turn]);
            const userX = await client.users.fetch(game.players['X']);
            const userO = await client.users.fetch(game.players['O']);

            const gameContainer = createGameContainer(0x38bdf8, `**Game On!**\n\n**X:** ${userX}\n**O:** ${userO}\n\nIt's **${turnUser.username}'s** turn (X).`);
            const boardComponents = generateBoardComponents(game.board, messageId);

            return interaction.update({ content: ' ', components: [gameContainer, ...boardComponents] });
        }

        if (action === 'play') {
            if (interaction.user.id !== game.players[game.turn]) return interaction.reply({ content: "It's not your turn!", ephemeral: true });

            const [coords] = args;
            const [row, col] = coords.split('-').map(Number);
            if (game.board[row][col]) return interaction.reply({ content: 'This spot is already taken!', ephemeral: true });

            game.board[row][col] = game.turn;
            const gameState = checkGameState(game.board);

            if (gameState) {
                let resultText;
                if (gameState === 'Tie') {
                    resultText = `**Game Over: It's a Tie!**\n\nWagers have been returned.`;
                    DatabaseManager.updateBalance(game.players['X'], game.wager);
                    DatabaseManager.updateBalance(game.players['O'], game.wager);
                } else {
                    const winnerId = game.players[gameState];
                    const winner = await client.users.fetch(winnerId);
                    const payout = Math.floor(game.wager * 1.85);
                    resultText = `**Game Over: ${winner.username} wins!**\n\nThey win **${payout.toLocaleString()}** ${AT_EMOJI}!`;
                    DatabaseManager.updateBalance(winnerId, game.wager + payout);
                    DatabaseManager.updateUser(winnerId, { gamesWon: (DatabaseManager.getUser(winnerId).gamesWon || 0) + 1 });
                }

                DatabaseManager.updateUser(game.players['X'], { gamesPlayed: (DatabaseManager.getUser(game.players['X']).gamesPlayed || 0) + 1 });
                DatabaseManager.updateUser(game.players['O'], { gamesPlayed: (DatabaseManager.getUser(game.players['O']).gamesPlayed || 0) + 1 });

                const finalContainer = createGameContainer(0x22c55e, resultText);
                const finalBoard = generateBoardComponents(game.board, messageId, true);
                await interaction.update({ components: [finalContainer, ...finalBoard] });
                cleanup();

            } else {
                game.turn = game.turn === 'X' ? 'O' : 'X';
                const turnUser = await client.users.fetch(game.players[game.turn]);
                const userX = await client.users.fetch(game.players['X']);
                const userO = await client.users.fetch(game.players['O']);
                const gameContainer = createGameContainer(0x38bdf8, `**Game In Progress...**\n\n**X:** ${userX}\n**O:** ${userO}\n\nIt's **${turnUser.username}'s** turn (${game.turn}).`);
                const boardComponents = generateBoardComponents(game.board, messageId);
                await interaction.update({ components: [gameContainer, ...boardComponents] });
            }
        }
    }
};
