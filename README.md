# Sistem Absensi Face Recognition

Sistem absensi berbasis *Face Recognition* (pengenalan wajah) untuk Mahasiswa, Dosen, dan Admin dengan *Role-Based Access Control* (RBAC).

## Prasyarat
Untuk menjalankan proyek ini di perangkat, pastikan untuk menginstal:
1. **Node.js** (Disarankan versi 18 atau terbaru)
2. **NPM** (Biasanya sudah sepaket dengan Node.js)
3. **MySQL Server** (Untuk database)

## Struktur Direktori
- `frontend/` - Aplikasi React + TypeScript + Vite.
- `backend/` - Aplikasi Node.js + Express.
- `database/` - File SQL untuk pembuatan skema dan data awal.

## 1. Setup Database MySQL
1. Buka antarmuka MySQL Anda (misal: phpMyAdmin, MySQL Workbench, atau terminal MySQL).
2. Jalankan isi file `database/schema.sql` untuk membuat database `absensi_db` beserta seluruh tabelnya.
3. Jalankan isi file `database/seed.sql` untuk memasukkan data dummy, termasuk akun admin.

## 2. Setup Backend (Node.js)
1. Buka terminal, masuk ke folder backend: `cd backend`
2. Instal dependensi: `npm install`
3. Buat file `.env` di dalam folder `backend/` dan isi dengan konfigurasi database Anda:
   ```env
   PORT=5000
   DB_HOST=localhost
   DB_USER=root
   DB_PASSWORD=
   DB_NAME=absensi_db
   JWT_SECRET=rahasia_jwt_anda_disini
   ```
4. Jalankan server mode pengembangan: `npm run dev`

## 3. Setup Frontend (React)
1. Buka terminal baru, masuk ke folder frontend: `cd frontend`
2. Instal dependensi: `npm install`
3. Jalankan server frontend: `npm run dev`
4. Buka URL yang tertera di terminal (biasanya `http://localhost:5173`) di browser Anda.

## Akun Demo (Dari seed.sql)
Semua akun demo di bawah ini menggunakan password: `password123`

- **Admin:** Username: `admin123`
- **Dosen:** Username: `dosen_joko`
- **Mahasiswa:** Username: `12345678`

## Status Pengerjaan (Tahap 1)
Saat ini proyek baru pada tahap inisialisasi awal. Struktur folder dan skema database sudah dibuat. Karena *Node.js* dan *NPM* tampaknya belum terinstal pada lingkungan eksekusi saat ini, saya hanya dapat menyiapkan kode-kode fundamental agar Anda dapat menjalankannya setelah Node.js diinstal.
