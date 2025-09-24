const { Client, GatewayIntentBits, Collection, REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

// Securely retrieve credentials from environment variables
const BOT_TOKEN = process.env.BOT_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

if (!BOT_TOKEN || !CLIENT_ID) {
    console.error('❌ Missing critical environment variables: BOT_TOKEN or CLIENT_ID.');
    process.exit(1);
}

// Initialize the Discord Client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

// Initialize collections and sets for handlers and state management
client.commands = new Collection();
client.activeUsers = new Set(); // For interaction locking
client.pendingGames = new Map(); // To track game challenges { messageId: gameData }

// --- DYNAMIC EVENT HANDLER ---
const eventsPath = path.join(__dirname, 'src', 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    const event = require(filePath);
    if (event.once) {
        client.once(event.name, (...args) => event.execute(...args, client));
    } else {
        client.on(event.name, (...args) => event.execute(...args, client));
    }
    console.log(`✅ Loaded event: ${event.name}`);
}

// --- DYNAMIC COMMAND HANDLER & DEPLOYMENT ---
(async () => {
    const commands = [];
    const commandsPath = path.join(__dirname, 'src', 'commands');
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        try {
            // Clear cache to allow for hot-reloading if ever implemented
            delete require.cache[require.resolve(filePath)];
            const command = require(filePath);
            if ('data' in command && 'execute' in command) {
                client.commands.set(command.data.name, command);
                commands.push(command.data.toJSON());
                console.log(`✅ Loaded command: ${command.data.name}`);
            } else {
                console.log(`⚠️ Command at ${filePath} is missing "data" or "execute".`);
            }
        } catch (error) {
            console.error(`❌ Error loading command ${file}:`, error);
        }
    }

    // Register commands with Discord API
    const rest = new REST().setToken(BOT_TOKEN);
    try {
        console.log(`🔄 Started refreshing ${commands.length} global application (/) commands.`);
        const data = await rest.put(
            Routes.applicationCommands(CLIENT_ID),
            { body: commands },
        );
        console.log(`✅ Successfully reloaded ${data.length} global application (/) commands.`);
    } catch (error) {
        console.error('❌ Failed to register global commands:', error);
    }
})();

// --- LOGIN ---
client.login(BOT_TOKEN).catch(error => {
    console.error('❌ Client login failed:', error);
    process.exit(1);
});

// --- GLOBAL ERROR HANDLERS ---
process.on('unhandledRejection', error => {
    console.error('🚨 Unhandled Promise Rejection:', error);
});

process.on('uncaughtException', error => {
    console.error('🚨 Uncaught Exception:', error);
    process.exit(1);
});
