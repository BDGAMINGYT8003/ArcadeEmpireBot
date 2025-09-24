const { SlashCommandBuilder, ContainerBuilder, SectionBuilder, TextDisplayBuilder, SeparatorBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const DatabaseManager = require('../utils/DatabaseManager');

const AT_EMOJI = '<:ArcadeTokens:1420147365213507686>';
const GJ_EMOJI = '<:GoldenJoysticks:1420147415868244148>';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('balance')
        .setDescription("Check your or another player's currency balance.")
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to check the balance of.')
                .setRequired(false)),

    async execute(interaction, client) {
        const targetUser = interaction.options.getUser('user') || interaction.user;
        const userProfile = DatabaseManager.getUser(targetUser.id);

        // If the user doesn't have a profile or isn't onboarded
        if (!userProfile || !userProfile.onboarded) {
            // If checking someone else who isn't onboarded
            if (targetUser.id !== interaction.user.id) {
                const errorContainer = new ContainerBuilder().setAccentColor(0xfb923c).addTextDisplayComponents(new TextDisplayBuilder().setContent(`**👋 New Player!**\n\n\`${targetUser.username}\` hasn't joined Arcade Empire yet. They need to run a command to start!`));
                return interaction.reply({ components: [errorContainer], flags: MessageFlags.IsComponentsV2, ephemeral: true });
            }
            // If checking self and not onboarded, start the tutorial
            return this.triggerOnboarding(interaction, client);
        }

        // --- Display Balance ---
        const isOwnBalance = targetUser.id === interaction.user.id;
        const title = isOwnBalance ? 'Your Balance' : `${targetUser.username}'s Balance`;
        const balanceContainer = new ContainerBuilder()
            .setAccentColor(0x818cf8)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`### ${title}`),
                new TextDisplayBuilder().setContent(`${AT_EMOJI} **Arcade Tokens:** \`${userProfile.arcadeTokens.toLocaleString()}\`\n${GJ_EMOJI} **Golden Joysticks:** \`${userProfile.goldenJoysticks.toLocaleString()}\``)
            );

        if (isOwnBalance && userProfile.gamesPlayed > 0) {
            const winRate = Math.round((userProfile.gamesWon / userProfile.gamesPlayed) * 100);
            balanceContainer
                .addSeparatorComponents(new SeparatorBuilder())
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**📊 Your Stats**\nGames Played: \`${userProfile.gamesPlayed}\`\nWin Rate: \`${winRate}%\``));
        }

        await interaction.reply({ components: [balanceContainer], flags: MessageFlags.IsComponentsV2 });
    },

    async triggerOnboarding(interaction, client) {
        client.activeUsers.add(interaction.user.id);
        DatabaseManager.createUser(interaction.user.id, interaction.user.username);

        const nextButton = new ButtonBuilder().setCustomId('tutorial_next').setLabel('Next').setStyle(ButtonStyle.Primary).setEmoji('▶️');
        const actionRow = new ActionRowBuilder().addComponents(nextButton);

        const welcomeContainer = new ContainerBuilder()
            .setAccentColor(0x10b981)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`### Welcome to Arcade Empire, ${interaction.user.username}!\nLet's get you started.`),
                new TextDisplayBuilder().setContent(`**💰 The Currency**\nYou have two types of currency:\n${AT_EMOJI} **Arcade Tokens (AT):** Used to play all games.\n${GJ_EMOJI} **Golden Joysticks (GJ):** A premium currency for special events.\n\nYou've been given a starting balance of **1,000 AT**!`)
            )
            .addActionRowComponents(actionRow);

        await interaction.reply({ components: [welcomeContainer], flags: MessageFlags.IsComponentsV2, ephemeral: true });
    },

    async handleButton(interaction, client) {
        // Using .update() on a button interaction is the correct way to modify the message
        // the button is attached to, without needing to defer. This should be fast enough.
        const [, action] = interaction.customId.split('_');

        if (action === 'next') {
            const completeButton = new ButtonBuilder().setCustomId('tutorial_finish').setLabel('Got it! Let me play!').setStyle(ButtonStyle.Success).setEmoji('✅');
            const actionRow = new ActionRowBuilder().addComponents(completeButton);
            const howToPlayContainer = new ContainerBuilder()
                .setAccentColor(0x10b981)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent('### 🎯 How to Play'),
                    new TextDisplayBuilder().setContent('Use slash commands like `/rps` or `/tictactoe` to challenge other players.\n\n`Syntax: /<game> <opponent> <wager>`'),
                    new TextDisplayBuilder().setContent(`**💎 Payouts & Fees**\n• Winners receive a **1.85x** payout!\n• 15% of the pot goes to the Arcade Fee to keep the economy balanced.`)
                )
                .addActionRowComponents(actionRow);
            await interaction.update({ components: [howToPlayContainer] });
        } else if (action === 'finish') {
            DatabaseManager.updateUser(interaction.user.id, { onboarded: true });
            client.activeUsers.delete(interaction.user.id);
            const finalContainer = new ContainerBuilder()
                .setAccentColor(0x10b981)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent("### 🎉 You're all set!"),
                    new TextDisplayBuilder().setContent(`Your starting balance of **1,000** ${AT_EMOJI} is ready.\n\nGood luck, have fun, and may the best player win!`)
                );
            await interaction.update({ components: [finalContainer] });
        }
    }
};
