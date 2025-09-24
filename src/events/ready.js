const { Events, ActivityType } = require('discord.js');
const DatabaseManager = require('../utils/DatabaseManager');

module.exports = {
    name: Events.ClientReady,
    once: true,
    execute(client) {
        console.log(`\n🤖 Logged in as ${client.user.tag}.`);
        console.log(` guilds: ${client.guilds.cache.size}`);
        console.log('Arcade Empire is online and ready for challenges!');

        client.user.setActivity('for challenges | /balance', { type: ActivityType.Watching });

        // Initialize the database, which loads the existing data file.
        DatabaseManager.init();
        console.log('✅ Database initialized.');
    },
};
