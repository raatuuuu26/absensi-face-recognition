const mysql = require('mysql2/promise');
require('dotenv').config();

async function fix() {
  try {
    const pool = mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'absensi_db',
    });
    // Valid hash for 'password123'
    const validHash = '\\\.uEb8.gduP6VLCRGypHHWgwM7QwhZVRctgv0GgXO';
    await pool.query('UPDATE users SET password_hash = ?', [validHash]);
    console.log('Fixed passwords!');
    process.exit(0);
  } catch (err) {
    console.error('DB ERROR:', err.message);
    process.exit(1);
  }
}
fix();
