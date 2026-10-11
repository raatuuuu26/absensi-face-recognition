const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
require('dotenv').config();

async function seed() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'absensi_db',
  });

  try {
    const hash = await bcrypt.hash('password123', 10);

    // Mahasiswa baru
    const students = [
      { nim: '240131006', name: 'Andini Nurrohmah' },
      { nim: '240131014', name: 'Laudya Fadilla Hadi' },
      { nim: '240131015', name: 'Layinatusyifa' },
      { nim: '2420131023', name: 'Rafa Nabilah Ramadhan' },
      { nim: '240131024', name: 'Ratu Maulani Maheswari' },
    ];

    for (const s of students) {
      // Cek apakah user sudah ada
      const [existing] = await pool.query('SELECT id FROM users WHERE username = ?', [s.nim]);
      let userId;

      if (existing.length > 0) {
        userId = existing[0].id;
        console.log(`User ${s.nim} sudah ada, skip.`);
      } else {
        const [userResult] = await pool.query(
          'INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)',
          [s.nim, hash, 'mahasiswa']
        );
        userId = userResult.insertId;
        console.log(`Created user: ${s.nim} (id: ${userId})`);
      }

      // Cek apakah student sudah ada
      const [existingStudent] = await pool.query('SELECT id FROM students WHERE nim = ?', [s.nim]);
      let studentId;

      if (existingStudent.length > 0) {
        studentId = existingStudent[0].id;
        console.log(`Student ${s.nim} sudah ada, skip.`);
      } else {
        const [studentResult] = await pool.query(
          'INSERT INTO students (user_id, nim, name, study_program_id) VALUES (?, ?, ?, 1)',
          [userId, s.nim, s.name]
        );
        studentId = studentResult.insertId;
        console.log(`Created student: ${s.name} (id: ${studentId})`);
      }

      // Daftarkan ke kedua kelas (class_enrollment)
      for (const classId of [1, 2]) {
        try {
          await pool.query(
            'INSERT IGNORE INTO class_enrollments (class_id, student_id) VALUES (?, ?)',
            [classId, studentId]
          );
        } catch (e) {}
      }
    }

    // Update jadwal agar relevan dengan waktu (jam 18.00 - 20.00)
    await pool.query(`
      UPDATE schedules SET 
        start_time = '18:00:00', 
        end_time = '20:00:00',
        status = 'active'
      WHERE id = 1
    `);
    console.log('Schedule updated: 18:00 - 20:00, status active');

    console.log('\n=== SELESAI! ===');
    console.log('Login mahasiswa: NIM sebagai username, password: password123');
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

seed();
