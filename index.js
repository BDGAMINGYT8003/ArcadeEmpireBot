const { Client, GatewayIntentBits, Collection, REST, Routes, ActivityType } = require('discord.js');
const fs = require('fs');
const path = require('path');

// Initialize bot client with required intents
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Collections for commands and active users
client.commands = new Collection();
client.activeUsers = new Set(); // For interaction locking

// Database utilities
const DatabaseManager = {
    dataPath: './data/users.json',
    
    init() {
        if (!fs.existsSync('./data')) {
            fs.mkdirSync('./data');
        }
        if (!fs.existsSync(this.dataPath)) {
            fs.writeFileSync(this.dataPath, JSON.stringify({}));
        }
    },

    loadData() {
        try {
            const data = fs.readFileSync(this.dataPath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            console.error('Error loading database:', error);
            return {};
        }
    },

    saveData(data) {
        try {
            fs.writeFileSync(this.dataPath, JSON.stringify(data, null, 2));
        } catch (error) {
            console.error('Error saving database:', error);
        }
    },

    getUser(userId) {
        const data = this.loadData();
        return data[userId] || null;
    },

    createUser(userId, username) {
        const data = this.loadData();
        data[userId] = {
            id: userId,
            username: username,
            arcadeTokens: 1000,
            goldenJoysticks: 0,
            onboarded: false,
            gamesPlayed: 0,
            gamesWon: 0,
            createdAt: Date.now()
        };
        this.saveData(data);
        return data[userId];
    },

    updateUser(userId, updates) {
        const data = this.loadData();
        if (data[userId]) {
            Object.assign(data[userId], updates);
            this.saveData(data);
        }
        return data[userId];
    }
};

// Initialize database
DatabaseManager.init();

// Dynamic command loading function
async function loadCommands() {
    const commandsPath = path.join(__dirname, 'commands');
    
    // Check if commands directory exists
    if (!fs.existsSync(commandsPath)) {
        console.log('Commands directory not found. Creating it...');
        fs.mkdirSync(commandsPath);
        return [];
    }

    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
    const commands = [];

    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        
        try {
            delete require.cache[require.resolve(filePath)];
            const command = require(filePath);
            
            if ('data' in command && 'execute' in command) {
                client.commands.set(command.data.name, command);
                commands.push(command.data.toJSON());
                console.log(`✅ Loaded command: ${command.data.name}`);
            } else {
                console.log(`⚠️  Command at ${filePath} is missing required "data" or "execute" property.`);
            }
        } catch (error) {
            console.error(`❌ Error loading command ${file}:`, error);
        }
    }

    return commands;
}

// Global slash command registration function
async function registerGlobalCommands(commands) {
    const BOT_TOKEN = process.env.BOT_TOKEN;
    const CLIENT_ID = process.env.CLIENT_ID;

    if (!BOT_TOKEN || !CLIENT_ID) {
        console.error('❌ Missing BOT_TOKEN or CLIENT_ID in environment variables!');
        process.exit(1);
    }

    const rest = new REST().setToken(BOT_TOKEN);

    try {
        console.log(`🔄 Started refreshing ${commands.length} application (/) commands globally.`);

        const data = await rest.put(
            Routes.applicationCommands(CLIENT_ID),
            { body: commands },
        );

        console.log(`✅ Successfully reloaded ${data.length} application (/) commands globally.`);
    } catch (error) {
        console.error('❌ Error registering slash commands:', error);
    }
}

// Bot ready event
client.once('ready', async () => {
    console.log(`🎮 Arcade Empire is online!`);
    console.log(`📊 Logged in as ${client.user.tag}`);
    console.log(`🏛️ Serving ${client.guilds.cache.size} guilds`);
    
    // Set bot activity
    client.user.setActivity('Arcade Games | /balance', { type: ActivityType.Playing });
});

// Interaction handler
client.on('interactionCreate', async interaction => {
    // Handle slash commands
    if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        
        if (!command) {
            console.error(`No command matching ${interaction.commandName} was found.`);
            return;
        }

        // Check if user is in an active command (interaction locking)
        if (client.activeUsers.has(interaction.user.id)) {
            return interaction.reply({
                embeds: [{
                    color: 0xff6b6b,
                    title: '🚫 Command in Progress',
                    description: 'You are already in an active command. Please complete or cancel it before starting a new one.',
                    timestamp: new Date().toISOString()
                }],
                ephemeral: true
            });
        }

        try {
            await command.execute(interaction, client, DatabaseManager);
        } catch (error) {
            console.error('❌ Error executing command:', error);
            
            const errorEmbed = {
                color: 0xff6b6b,
                title: '❌ Command Error',
                description: 'There was an error executing this command. Please try again.',
                timestamp: new Date().toISOString()
            };

            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
            } else {
                await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
        }
    }
    
    // Handle button interactions
    else if (interaction.isButton()) {
        try {
            // Find the command that handles this button interaction
            const commandName = interaction.customId.split('_')[0];
            const command = client.commands.get(commandName);
            
            if (command && command.handleButton) {
                await command.handleButton(interaction, client, DatabaseManager);
            }
        } catch (error) {
            console.error('❌ Error handling button interaction:', error);
        }
    }
});

// Error handlers
process.on('unhandledRejection', error => {
    console.error('Unhandled promise rejection:', error);
});

process.on('uncaughtException', error => {
    console.error('Uncaught exception:', error);
    process.exit(1);
});

// Main initialization function
async function main() {
    console.log('🚀 Starting Arcade Empire...');
    
    // Load commands
    const commands = await loadCommands();
    
    // Register global slash commands
    await registerGlobalCommands(commands);
    
    // Login to Discord
    const BOT_TOKEN = process.env.BOT_TOKEN;
    if (!BOT_TOKEN) {
        console.error('❌ BOT_TOKEN not found in environment variables!');
        process.exit(1);
    }
    
    await client.login(BOT_TOKEN);
}

// Export for testing
module.exports = { client, DatabaseManager };

// Start the bot
if (require.main === module) {
    main().catch(console.error);
}