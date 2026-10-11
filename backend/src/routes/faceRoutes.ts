import { Router } from 'express';
import pool from '../config/db';

const router = Router();

// Endpoint untuk mendaftarkan wajah (Enrollment) 3 Sudut: Depan, Kanan, Kiri
router.post('/enroll', async (req, res) => {
  try {
    const { studentId, embedding, angles } = req.body;

    if (!studentId || (!embedding && !angles)) {
      return res.status(400).json({ message: 'Data mahasiswa atau vektor wajah tidak valid' });
    }

    const [students]: any = await pool.execute('SELECT id, name FROM students WHERE user_id = ?', [studentId]);
    if (students.length === 0) {
      return res.status(404).json({ message: 'Data mahasiswa tidak ditemukan' });
    }

    const studentDbId = students[0].id;
    // Format data: simpan objek dengan sudut { front, right, left } atau array tunggal
    const storedData = angles ? {
      front: angles.front,
      right: angles.right,
      left: angles.left,
      enrolledAt: new Date().toISOString()
    } : embedding;

    const embeddingJson = JSON.stringify(storedData);

    await pool.execute(
      `INSERT INTO face_embeddings (student_id, embedding_data) 
       VALUES (?, ?) 
       ON DUPLICATE KEY UPDATE embedding_data = ?`,
      [studentDbId, embeddingJson, embeddingJson]
    );

    res.json({
      success: true,
      message: `Pendaftaran Wajah 3 Sudut (Depan, Kanan, Kiri) Berhasil untuk ${students[0].name}!`
    });
  } catch (error) {
    console.error('Enroll error:', error);
    res.status(500).json({ message: 'Gagal menyimpan data wajah ke server' });
  }
});

// Endpoint untuk mengambil embedding mahasiswa (untuk pencocokan di frontend)
router.get('/embedding/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const [students]: any = await pool.execute('SELECT id FROM students WHERE user_id = ?', [userId]);
    if (students.length === 0) {
      return res.status(404).json({ message: 'Data mahasiswa tidak ditemukan' });
    }

    const studentDbId = students[0].id;
    const [rows]: any = await pool.execute(
      'SELECT embedding_data FROM face_embeddings WHERE student_id = ?',
      [studentDbId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Wajah belum didaftarkan. Lakukan Enrollment terlebih dahulu.' });
    }

    const rawData = rows[0].embedding_data;
    const parsedData = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
    const finalEmbedding = (parsedData && parsedData.front) ? parsedData.front : parsedData;

    res.json({ embedding: finalEmbedding });
  } catch (error) {
    console.error('Get embedding error:', error);
    res.status(500).json({ message: 'Gagal mengambil data wajah' });
  }
});

// Endpoint untuk mengambil SEMUA embedding (digunakan saat absensi multi-mahasiswa)
// Sistem akan mencari siapa yang paling mirip dengan wajah yang terdeteksi
router.get('/all-embeddings', async (req, res) => {
  try {
    const [rows]: any = await pool.query(`
      SELECT 
        fe.student_id,
        fe.embedding_data,
        s.nim,
        s.name AS student_name,
        u.id AS user_id
      FROM face_embeddings fe
      JOIN students s ON fe.student_id = s.id
      JOIN users u ON s.user_id = u.id
    `);

    const result: any[] = [];
    for (const row of rows) {
      const raw = row.embedding_data;
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      
      // Jika disimpan dalam bentuk 3 sudut { front, right, left }
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.front) {
        result.push({
          studentId: row.student_id,
          userId: row.user_id,
          nim: row.nim,
          studentName: row.student_name,
          embedding: parsed.front, // default primary
          allAngles: [parsed.front, parsed.right, parsed.left].filter(Boolean)
        });
      } else {
        result.push({
          studentId: row.student_id,
          userId: row.user_id,
          nim: row.nim,
          studentName: row.student_name,
          embedding: parsed,
          allAngles: [parsed]
        });
      }
    }

    res.json(result);
  } catch (error) {
    console.error('All embeddings error:', error);
    res.status(500).json({ message: 'Gagal mengambil data wajah' });
  }
});

// Endpoint untuk mengambil jadwal yang sedang aktif
router.get('/schedules/active', async (req, res) => {
  try {
    const [rows]: any = await pool.query(`
      SELECT 
        s.id,
        s.meeting_number,
        s.schedule_date,
        s.start_time,
        s.end_time,
        s.latitude,
        s.longitude,
        s.radius_meters,
        c.name AS course_name,
        cl.class_name
      FROM schedules s
      JOIN classes cl ON s.class_id = cl.id
      JOIN courses c ON cl.course_id = c.id
      WHERE s.status = 'active'
    `);
    res.json(rows);
  } catch (error) {
    console.error('Error get active schedules:', error);
    res.status(500).json({ message: 'Gagal mengambil jadwal aktif' });
  }
});

// Endpoint untuk melihat riwayat absensi mahasiswa (tanggal & waktu terakhir absen)
router.get('/student-history/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const [students]: any = await pool.execute('SELECT id, nim, name FROM students WHERE user_id = ?', [userId]);
    if (students.length === 0) {
      return res.status(404).json({ message: 'Mahasiswa tidak ditemukan' });
    }
    const student = students[0];

    const [rows]: any = await pool.execute(
      `SELECT 
        a.id,
        a.status,
        a.confidence_score,
        a.recorded_at,
        c.name AS course_name,
        cl.class_name,
        sch.meeting_number
       FROM attendance a
       JOIN schedules sch ON a.schedule_id = sch.id
       JOIN classes cl ON sch.class_id = cl.id
       JOIN courses c ON cl.course_id = c.id
       WHERE a.student_id = ?
       ORDER BY a.recorded_at DESC
       LIMIT 10`,
      [student.id]
    );

    const lastAttendance = rows.length > 0 ? rows[0] : null;

    res.json({
      student,
      lastAttendance,
      history: rows
    });
  } catch (error) {
    console.error('Student history error:', error);
    res.status(500).json({ message: 'Gagal mengambil riwayat absensi' });
  }
});

// Helper untuk menghitung jarak 2 koordinat bumi (Haversine formula dalam meter)
function getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371e3; // meter
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Endpoint untuk mencatat kehadiran dengan Validasi Wajah (>=85%), Waktu (Batas 19:00), dan Lokasi
router.post('/attend', async (req, res) => {
  try {
    const { userId, scheduleId, confidenceScore, latitude, longitude } = req.body;

    // 1. Validasi Ambang Batas Wajah (Harus >= 85%)
    if (typeof confidenceScore !== 'number' || confidenceScore < 0.85) {
      return res.status(400).json({
        success: false,
        message: `Tingkat kemiripan wajah (${((confidenceScore || 0) * 100).toFixed(1)}%) belum mencapai ambang batas minimal 85%. Silakan posisikan wajah lebih jelas dan coba lagi.`
      });
    }

    // 2. Ambil data mahasiswa
    const [students]: any = await pool.execute('SELECT id, nim, name FROM students WHERE user_id = ?', [userId]);
    if (students.length === 0) {
      return res.status(404).json({ success: false, message: 'Data mahasiswa tidak ditemukan' });
    }
    const student = students[0];

    // 3. Cek jadwal aktif
    const [schedules]: any = await pool.execute(
      "SELECT * FROM schedules WHERE id = ? AND status = 'active'",
      [scheduleId]
    );
    if (schedules.length === 0) {
      return res.status(400).json({ success: false, message: 'Jadwal tidak aktif atau tidak ditemukan' });
    }
    const schedule = schedules[0];

    // 4. Validasi Lokasi (Geofencing jika koordinat jadwal tersedia)
    let locationStatus = 'Lokasi Terverifikasi';
    let distanceMeters = 0;
    if (schedule.latitude && schedule.longitude && latitude && longitude) {
      distanceMeters = getDistanceMeters(
        parseFloat(latitude),
        parseFloat(longitude),
        parseFloat(schedule.latitude),
        parseFloat(schedule.longitude)
      );
      const maxRadius = schedule.radius_meters || 100;
      if (distanceMeters > maxRadius) {
        return res.status(400).json({
          success: false,
          message: `Di luar radius absensi! Jarak Anda ${Math.round(distanceMeters)}m dari kelas (Maksimal radius ${maxRadius}m).`
        });
      }
    } else {
      locationStatus = latitude && longitude ? `Koordinat: ${latitude}, ${longitude}` : 'Lokasi bawaan kampus';
    }

    // 5. Validasi Waktu (Aturan: lewat jam 19.00 malam = Terlambat, jam 18.00 / < 19.00 = Tepat Waktu)
    const now = new Date();
    const currentHour = now.getHours(); // 0 - 23
    const currentTimeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    // Jika lewat dari jam 19:00 (jam 7 malam) maka dianggap 'terlambat', di bawah jam 19 dianggap 'hadir' (tepat waktu)
    const status = currentHour >= 19 ? 'terlambat' : 'hadir';
    const statusLabel = status === 'terlambat' ? 'Terlambat (Lewat jam 19:00)' : 'Hadir Tepat Waktu (Sebelum jam 19:00)';

    const { faceSnapshot } = req.body;

    // 6. Simpan atau perbarui data absensi (termasuk snapshot foto wajah untuk verifikasi admin)
    await pool.execute(
      `INSERT INTO attendance (schedule_id, student_id, status, confidence_score, liveness_passed, latitude, longitude, face_snapshot)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE 
         status = ?, 
         confidence_score = ?, 
         latitude = ?, 
         longitude = ?, 
         face_snapshot = COALESCE(?, face_snapshot),
         recorded_at = CURRENT_TIMESTAMP`,
      [
        scheduleId,
        student.id,
        status,
        confidenceScore,
        true,
        latitude || null,
        longitude || null,
        faceSnapshot || null,
        status,
        confidenceScore,
        latitude || null,
        longitude || null,
        faceSnapshot || null
      ]
    );

    // 7. Simpan Audit Trail (Waktu dan IP Client)
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    await pool.execute(
      `INSERT INTO audit_logs (user_id, action, description, ip_address)
       VALUES (?, ?, ?, ?)`,
      [
        userId,
        'ATTENDANCE_SUCCESS',
        `Presensi wajah berhasil (${student.name} - ${student.nim}), status: ${status}, confidence: ${(confidenceScore * 100).toFixed(1)}%`,
        String(clientIp)
      ]
    );

    res.json({
      success: true,
      message: `Presensi Berhasil Dicatat!`,
      details: {
        nim: student.nim,
        name: student.name,
        status,
        statusLabel,
        confidence: `${(confidenceScore * 100).toFixed(1)}%`,
        time: currentTimeStr,
        location: locationStatus,
        clientIp: String(clientIp)
      }
    });

  } catch (error) {
    console.error('Attend error:', error);
    res.status(500).json({ success: false, message: 'Gagal mencatat kehadiran pada database' });
  }
});

export default router;

