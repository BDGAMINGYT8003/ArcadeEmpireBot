const { SlashCommandBuilder, ContainerBuilder, SectionBuilder, TextDisplayBuilder, SeparatorBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('balance')
        .setDescription('Check your or another player\'s currency balance')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user whose balance you want to check')
                .setRequired(false)),

    async execute(interaction, client, DatabaseManager) {
        const targetUser = interaction.options.getUser('user') || interaction.user;
        
        // Check if target user has a profile
        const userProfile = DatabaseManager.getUser(targetUser.id);
        
        if (!userProfile) {
            // If checking another user who doesn't have a profile
            if (targetUser.id !== interaction.user.id) {
                const errorContainer = new ContainerBuilder()
                    .setAccentColor(0xff6b6b)
                    .addTextDisplayComponents(
                        textDisplay => textDisplay
                            .setContent(`**🚫 User Not Found**\n\n${targetUser.username} hasn't joined Arcade Empire yet! They need to use any command to get started.`)
                    );

                return interaction.reply({
                    components: [errorContainer],
                    flags: MessageFlags.IsComponentsV2,
                    ephemeral: true
                });
            }
            
            // If user checking themselves doesn't have profile, trigger onboarding
            return await this.triggerOnboarding(interaction, client, DatabaseManager);
        }

        // If user isn't onboarded yet, trigger tutorial
        if (!userProfile.onboarded && targetUser.id === interaction.user.id) {
            return await this.triggerOnboarding(interaction, client, DatabaseManager);
        }

        // Display balance with beautiful formatting
        const arcadeTokenEmoji = '<:ArcadeTokens:1420147365213507686>';
        const goldenJoystickEmoji = '<:GoldenJoysticks:1420147415868244148>';
        
        const isOwnBalance = targetUser.id === interaction.user.id;
        const title = isOwnBalance ? '💰 Your Balance' : `💰 ${targetUser.username}'s Balance`;
        
        const balanceSection = new SectionBuilder()
            .addTextDisplayComponents(
                textDisplay => textDisplay
                    .setContent(`**${title}**\n\n${arcadeTokenEmoji} **Arcade Tokens:** \`${userProfile.arcadeTokens.toLocaleString()}\` AT\n${goldenJoystickEmoji} **Golden Joysticks:** \`${userProfile.goldenJoysticks.toLocaleString()}\` GJ`)
            );

        const balanceContainer = new ContainerBuilder()
            .setAccentColor(0x4f46e5)
            .addSectionComponents(balanceSection);

        // Add stats section if it's their own balance
        if (isOwnBalance && userProfile.gamesPlayed > 0) {
            const winRate = Math.round((userProfile.gamesWon / userProfile.gamesPlayed) * 100);
            balanceContainer
                .addSeparatorComponents(
                    separator => separator
                )
                .addTextDisplayComponents(
                    textDisplay => textDisplay
                        .setContent(`**📊 Game Stats**\nGames Played: \`${userProfile.gamesPlayed}\`\nGames Won: \`${userProfile.gamesWon}\`\nWin Rate: \`${winRate}%\``)
                );
        }

        await interaction.reply({
            components: [balanceContainer],
            flags: MessageFlags.IsComponentsV2
        });
    },

    async triggerOnboarding(interaction, client, DatabaseManager) {
        // Add user to active users to prevent other commands
        client.activeUsers.add(interaction.user.id);
        
        // Create user profile
        const userProfile = DatabaseManager.createUser(interaction.user.id, interaction.user.username);
        
        const arcadeTokenEmoji = '<:ArcadeTokens:1420147365213507686>';
        const goldenJoystickEmoji = '<:GoldenJoysticks:1420147415868244148>';
        
        const nextButton = new ButtonBuilder()
            .setCustomId('tutorial_step2')
            .setLabel('Next: How to Play')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('▶️');

        const tutorialContainer = new ContainerBuilder()
            .setAccentColor(0x10b981)
            .addTextDisplayComponents(
                textDisplay => textDisplay
                    .setContent(`**🎮 Welcome to Arcade Empire!**\n\nHi ${interaction.user.username}! You're new here, so let me show you around!`)
            )
            .addSeparatorComponents(
                separator => separator
            )
            .addTextDisplayComponents(
                textDisplay => textDisplay
                    .setContent(`**💰 Currency System**\n\n${arcadeTokenEmoji} **Arcade Tokens (AT)** - Primary currency for games\n${goldenJoystickEmoji} **Golden Joysticks (GJ)** - Premium currency for special features\n\nYou start with **1,000 AT** and **0 GJ**!`)
            )
            .addActionRowComponents(
                actionRow => actionRow.addComponents(nextButton)
            );

        await interaction.reply({
            components: [tutorialContainer],
            flags: MessageFlags.IsComponentsV2,
            ephemeral: true
        });
    },

    async handleButton(interaction, client, DatabaseManager) {
        if (interaction.customId === 'tutorial_step2') {
            const completeButton = new ButtonBuilder()
                .setCustomId('tutorial_complete')
                .setLabel('Got it! Let me play!')
                .setStyle(ButtonStyle.Success)
                .setEmoji('✅');

            const tutorialContainer = new ContainerBuilder()
                .setAccentColor(0x10b981)
                .addTextDisplayComponents(
                    textDisplay => textDisplay
                        .setContent(`**🎯 How to Challenge Players**\n\nUse game commands like \`/rps @user 100\` or \`/tictactoe @user 50\` to challenge other players!\n\nBoth players must accept before the game starts.`)
                )
                .addSeparatorComponents(
                    separator => separator
                )
                .addTextDisplayComponents(
                    textDisplay => textDisplay
                        .setContent(`**💎 Payouts & Fees**\n\n• Winner gets **1.85x** their bet\n• Loser loses their wager\n• 15% goes to "Arcade Fee" (keeps economy balanced)`)
                )
                .addActionRowComponents(
                    actionRow => actionRow.addComponents(completeButton)
                );

            await interaction.update({
                components: [tutorialContainer],
                flags: MessageFlags.IsComponentsV2
            });
        }
        
        else if (interaction.customId === 'tutorial_complete') {
            // Mark user as onboarded and remove from active users
            DatabaseManager.updateUser(interaction.user.id, { onboarded: true });
            client.activeUsers.delete(interaction.user.id);
            
            const arcadeTokenEmoji = '<:ArcadeTokens:1420147365213507686>';
            const goldenJoystickEmoji = '<:GoldenJoysticks:1420147415868244148>';
            
            const balanceSection = new SectionBuilder()
                .addTextDisplayComponents(
                    textDisplay => textDisplay
                        .setContent(`**💰 Your Starting Balance**\n\n${arcadeTokenEmoji} **Arcade Tokens:** \`1,000\` AT\n${goldenJoystickEmoji} **Golden Joysticks:** \`0\` GJ\n\nNow try challenging someone to a game!`)
                );

            const completeContainer = new ContainerBuilder()
                .setAccentColor(0x10b981)
                .addTextDisplayComponents(
                    textDisplay => textDisplay
                        .setContent(`**🎉 Welcome to Arcade Empire!**\n\nYou're all set up and ready to play! Here's your starting balance:`)
                )
                .addSeparatorComponents(
                    separator => separator
                )
                .addSectionComponents(balanceSection);

            await interaction.update({
                components: [completeContainer],
                flags: MessageFlags.IsComponentsV2
            });
        }
    }
};