const mongoose = require('mongoose');

const teardownDB = async () => {
    await mongoose.disconnect();
    await mongoose.connection.close();
};

module.exports = teardownDB;