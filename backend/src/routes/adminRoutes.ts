import { Router } from 'express';
import pool from '../config/db';

const router = Router();

// Statistik dashboard admin
router.get('/stats', async (req, res) => {
  try {
    const [[{ totalMahasiswa }]]: any = await pool.query('SELECT COUNT(*) as totalMahasiswa FROM students');
    const [[{ totalDosen }]]: any = await pool.query('SELECT COUNT(*) as totalDosen FROM lecturers');
    const [[{ totalAbsensiHariIni }]]: any = await pool.query(
      "SELECT COUNT(*) as totalAbsensiHariIni FROM attendance WHERE DATE(recorded_at) = CURDATE()"
    );
    const [[{ totalTerdaftarWajah }]]: any = await pool.query('SELECT COUNT(*) as totalTerdaftarWajah FROM face_embeddings');

    res.json({ totalMahasiswa, totalDosen, totalAbsensiHariIni, totalTerdaftarWajah });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Gagal mengambil statistik' });
  }
});

// Daftar semua absensi (terbaru)
router.get('/attendance', async (req, res) => {
  try {
    const [rows]: any = await pool.query(`
      SELECT 
        a.id,
        s.nim,
        s.name AS student_name,
        c.name AS course_name,
        cl.class_name,
        a.status,
        a.confidence_score,
        a.recorded_at,
        a.face_snapshot
      FROM attendance a
      JOIN students s ON a.student_id = s.id
      JOIN schedules sch ON a.schedule_id = sch.id
      JOIN classes cl ON sch.class_id = cl.id
      JOIN courses c ON cl.course_id = c.id
      ORDER BY a.recorded_at DESC
      LIMIT 50
    `);
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Gagal mengambil data absensi' });
  }
});

// Daftar mahasiswa + status wajah terdaftar
router.get('/students', async (req, res) => {
  try {
    const [rows]: any = await pool.query(`
      SELECT 
        s.id,
        s.nim,
        s.name,
        sp.name AS study_program,
        fe.embedding_data,
        CASE WHEN fe.id IS NOT NULL THEN 'Terdaftar' ELSE 'Belum' END AS face_status
      FROM students s
      LEFT JOIN study_programs sp ON s.study_program_id = sp.id
      LEFT JOIN face_embeddings fe ON s.id = fe.student_id
      ORDER BY s.name
    `);

    const formatted = rows.map((r: any) => {
      let angles = { front: false, right: false, left: false };
      if (r.embedding_data) {
        const raw = r.embedding_data;
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.front) {
          angles = {
            front: !!parsed.front,
            right: !!parsed.right,
            left: !!parsed.left
          };
        } else if (parsed) {
          angles = { front: true, right: false, left: false };
        }
      }

      return {
        id: r.id,
        nim: r.nim,
        name: r.name,
        study_program: r.study_program,
        face_status: r.face_status,
        angles
      };
    });

    res.json(formatted);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Gagal mengambil data mahasiswa' });
  }
});

// Rekap kehadiran mahasiswa per kelas & kelayakan ujian (Syarat: kehadiran >= 75%)
router.get('/recap', async (req, res) => {
  try {
    // Total pertemuan kelas TI-A (default asumsi 16 pertemuan, atau hitung jadwal)
    const [[{ totalMeetings }]]: any = await pool.query(
      "SELECT COUNT(*) as totalMeetings FROM schedules WHERE class_id = 1"
    );
    const targetMeetings = totalMeetings > 0 ? totalMeetings : 16;

    const [rows]: any = await pool.query(`
      SELECT 
        s.id AS student_id,
        s.nim,
        s.name,
        sp.name AS study_program,
        COUNT(CASE WHEN a.status = 'hadir' THEN 1 END) AS hadir_count,
        COUNT(CASE WHEN a.status = 'terlambat' THEN 1 END) AS terlambat_count,
        COUNT(CASE WHEN a.status = 'izin' THEN 1 END) AS izin_count,
        COUNT(a.id) AS total_hadir
      FROM students s
      LEFT JOIN study_programs sp ON s.study_program_id = sp.id
      LEFT JOIN attendance a ON a.student_id = s.id AND a.status IN ('hadir', 'terlambat')
      GROUP BY s.id, s.nim, s.name, sp.name
      ORDER BY s.nim ASC
    `);

    const recap = rows.map((r: any) => {
      // Kehadiran dihitung dari hadir + terlambat (atau hadir penuh)
      const attended = Number(r.total_hadir);
      // Persentase kehadiran terhadap target pertemuan
      const percentage = Math.min(100, Math.round((attended / targetMeetings) * 100));
      // Syarat ujian: minimal 75%
      const examEligible = percentage >= 75;

      return {
        studentId: r.student_id,
        nim: r.nim,
        name: r.name,
        studyProgram: r.study_program,
        hadir: Number(r.hadir_count),
        terlambat: Number(r.terlambat_count),
        totalHadir: attended,
        totalTarget: targetMeetings,
        percentage,
        examEligible,
        statusUjian: examEligible ? 'Layak Mengikuti Ujian' : 'Tidak Memenuhi Syarat ( < 75% )'
      };
    });

    res.json({ targetMeetings, recap });
  } catch (error) {
    console.error('Error recap:', error);
    res.status(500).json({ message: 'Gagal mengambil data rekap kehadiran' });
  }
});

export default router;
