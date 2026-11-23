const { migrate } = require('../src/db');
migrate();
console.log('Database is up to date.');
