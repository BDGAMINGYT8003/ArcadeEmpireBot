const { Events, ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');
const DatabaseManager = require('../utils/DatabaseManager');

// Helper function for consistent error replies
const sendError = async (interaction, message) => {
    const errorContainer = new ContainerBuilder()
        .setAccentColor(0xff6b6b)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(message));

    const payload = {
        components: [errorContainer],
        flags: MessageFlags.IsComponentsV2,
        ephemeral: true,
    };

    try {
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp(payload);
        } else {
            await interaction.reply(payload);
        }
    } catch (e) {
        console.error("Failed to send error message:", e);
    }
};

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction, client) {
        // --- SLASH COMMAND HANDLING ---
        if (interaction.isChatInputCommand()) {
            const command = interaction.client.commands.get(interaction.commandName);
            if (!command) {
                console.error(`No command matching "${interaction.commandName}" was found.`);
                return sendError(interaction, '❌ **Command Not Found**\nAn error occurred while trying to execute that command.');
            }

            const userProfile = DatabaseManager.getUser(interaction.user.id);
            const isNewOrUnonboarded = !userProfile || !userProfile.onboarded;

            // Onboarding Interception: If user is new and not using /balance, trigger tutorial.
            if (isNewOrUnonboarded && interaction.commandName !== 'balance') {
                const balanceCommand = interaction.client.commands.get('balance');
                if (balanceCommand?.triggerOnboarding) {
                    return balanceCommand.triggerOnboarding(interaction, client);
                }
            }

            // Interaction Locking: Prevent new commands if user is in a game/tutorial.
            if (client.activeUsers.has(interaction.user.id)) {
                return sendError(interaction, '🚫 **Command in Progress**\nYou are already in an active command. Please complete or cancel it before starting a new one.');
            }

            try {
                await command.execute(interaction, client);
            } catch (error) {
                console.error(`Error executing command "${interaction.commandName}":`, error);
                await sendError(interaction, '❌ **Command Error**\nThere was an error while executing this command.');
            }
        }

        // --- BUTTON HANDLING ---
        else if (interaction.isButton()) {
            try {
                const [commandName] = interaction.customId.split('_');
                let command;

                // Route 'tutorial' buttons to the 'balance' command's handler
                if (commandName === 'tutorial') {
                    command = interaction.client.commands.get('balance');
                } else {
                    command = interaction.client.commands.get(commandName);
                }

                if (command?.handleButton) {
                    await command.handleButton(interaction, client);
                } else {
                    console.warn(`No button handler found for command: ${commandName}`);
                    await sendError(interaction, '❌ **Unknown Action**\nThis button seems to have expired or is invalid.');
                }
            } catch (error) {
                console.error(`Error handling button interaction "${interaction.customId}":`, error);
                await sendError(interaction, '❌ **Button Error**\nThere was an error processing this action.');
            }
        }
    },
};
