const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
require('dotenv').config();

async function check() {
  try {
    const pool = mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'absensi_db',
    });
    const [rows] = await pool.query('SELECT * FROM users WHERE username="admin123"');
    console.log('USER:', rows[0]);
    const isMatch = await bcrypt.compare('password123', rows[0].password_hash);
    console.log('Bcrypt match?', isMatch);
    process.exit(0);
  } catch(e) {
    console.error(e);
    process.exit(1);
  }
}
check();
