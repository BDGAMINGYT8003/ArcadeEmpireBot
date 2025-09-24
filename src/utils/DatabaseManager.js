const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', '..', 'data');
const dataPath = path.join(dataDir, 'users.json');

let database = {};

// Helper function to write the database to file synchronously
const saveData = () => {
    try {
        // Ensure the directory exists
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        fs.writeFileSync(dataPath, JSON.stringify(database, null, 4));
    } catch (error) {
        console.error('❌ Error saving database:', error);
    }
};

// Helper function to read the database from file
const loadData = () => {
    try {
        if (!fs.existsSync(dataPath)) {
            console.log('Database file not found, creating a new one.');
            saveData(); // This will create an empty {} file
            return;
        }
        const jsonData = fs.readFileSync(dataPath, 'utf8');
        // If the file is empty, initialize with an empty object
        database = jsonData ? JSON.parse(jsonData) : {};
    } catch (error) {
        console.error('❌ Error loading database:', error);
        database = {}; // Reset to empty object on error
    }
};

module.exports = {
    /**
     * Initializes the database by loading it from the file.
     */
    init() {
        loadData();
    },

    /**
     * Retrieves a user's profile.
     * @param {string} userId The user's Discord ID.
     * @returns {object|null} The user's profile object or null if not found.
     */
    getUser(userId) {
        return database[userId] || null;
    },

    /**
     * Creates a new user profile with default values.
     * @param {string} userId The user's Discord ID.
     * @param {string} username The user's Discord username.
     * @returns {object} The newly created user profile.
     */
    createUser(userId, username) {
        if (database[userId]) {
            return database[userId];
        }
        const newUser = {
            id: userId,
            username: username,
            arcadeTokens: 1000,
            goldenJoysticks: 0,
            onboarded: false,
            gamesPlayed: 0,
            gamesWon: 0,
            createdAt: new Date().toISOString(),
        };
        database[userId] = newUser;
        saveData();
        return newUser;
    },

    /**
     * Updates an existing user's profile.
     * @param {string} userId The user's Discord ID.
     * @param {object} updates An object containing the properties to update.
     * @returns {object|null} The updated user profile or null if not found.
     */
    updateUser(userId, updates) {
        if (!database[userId]) {
            return null;
        }
        // Ensure username is updated if it has changed
        if (updates.username && database[userId].username !== updates.username) {
            database[userId].username = updates.username;
        }
        Object.assign(database[userId], updates);
        saveData();
        return database[userId];
    },

    /**
     * Updates a user's Arcade Token balance.
     * @param {string} userId The user's Discord ID.
     * @param {number} amount The amount to add (can be negative).
     * @returns {number|null} The new balance or null if user not found.
     */
    updateBalance(userId, amount) {
        if (!database[userId]) {
            return null;
        }
        database[userId].arcadeTokens += amount;
        saveData();
        return database[userId].arcadeTokens;
    },
};
