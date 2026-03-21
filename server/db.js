const mysql = require('mysql2');

const db = mysql.createConnection({
  host: 'ballast.proxy.rlwy.net',
  port: 21222,
  user: 'root',
  password: 'WTkZqdgEBFAHKdEZVOPIBSvNMOqzbZao',
  database: 'ers'
});

db.connect((err) => {
  if (err) {
    console.error('❌ DB connection failed:', err);
    return;
  }
  console.log('✅ Connected to MySQL database');
});

module.exports = db;