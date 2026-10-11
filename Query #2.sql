-- seed.sql

USE absensi_db;

-- Insert Admin (Password: password123, di hash dengan bcrypt. Hash ini adalah contoh statis untuk 'password123')
INSERT INTO users (username, password_hash, role) VALUES 
('admin123', '$2b$10$wO3tOqD/F3l70v4i7j6Kz.U5Y5s8xWp5y5LqR6M9/1V0/2l3m4n5', 'admin'),
('dosen_joko', '$2b$10$wO3tOqD/F3l70v4i7j6Kz.U5Y5s8xWp5y5LqR6M9/1V0/2l3m4n5', 'dosen'),
('12345678', '$2b$10$wO3tOqD/F3l70v4i7j6Kz.U5Y5s8xWp5y5LqR6M9/1V0/2l3m4n5', 'mahasiswa');

INSERT INTO study_programs (code, name) VALUES 
('TI', 'Teknik Informatika'),
('SI', 'Sistem Informasi');

INSERT INTO lecturers (user_id, nidn, name) VALUES 
(2, '987654321', 'Dr. Joko Susilo');

INSERT INTO students (user_id, nim, name, study_program_id) VALUES 
(3, '12345678', 'Budi Santoso', 1);

INSERT INTO courses (code, name, credits) VALUES 
('CS101', 'Algoritma dan Pemrograman', 3),
('CS102', 'Basis Data', 3);

INSERT INTO classes (course_id, lecturer_id, class_name, semester, academic_year) VALUES 
(1, 1, 'TI-A', 'Ganjil', '2023/2024'),
(2, 1, 'TI-B', 'Ganjil', '2023/2024');

INSERT INTO class_enrollments (class_id, student_id) VALUES 
(1, 1),
(2, 1);

INSERT INTO schedules (class_id, meeting_number, schedule_date, start_time, end_time, status) VALUES 
(1, 1, CURDATE(), '08:00:00', '10:30:00', 'active'),
(2, 1, CURDATE(), '13:00:00', '15:30:00', 'inactive');
