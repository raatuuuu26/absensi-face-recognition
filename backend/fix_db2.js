const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
require('dotenv').config();

async function fix() {
  try {
    const pool = mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'absensi_db',
    });
    
    // Hash password secara langsung disini untuk menghindari error escape character
    const hash = await bcrypt.hash('password123', 10);
    
    await pool.query('UPDATE users SET password_hash = ?', [hash]);
    console.log('Fixed properly! Hash:', hash);
    process.exit(0);
  } catch (err) {
    console.error('DB ERROR:', err.message);
    process.exit(1);
  }
}
fix();
