import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Webcam from 'react-webcam';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

const DashboardPage = () => {
  const navigate = useNavigate();
  const userStr = localStorage.getItem('user');
  
  if (!userStr) {
    navigate('/');
    return null;
  }

  const user = JSON.parse(userStr);
  const role = user.role;

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/');
  };

  // --- KOMPONEN POV MAHASISWA ---
  const StudentPOV = () => {
    const [isCameraOpen, setIsCameraOpen] = useState(false);
    const [modelsLoaded, setModelsLoaded] = useState(false);
    const [faceDetected, setFaceDetected] = useState(false);
    const [statusText, setStatusText] = useState('');
    const webcamRef = React.useRef<any>(null);
    const canvasRef = React.useRef<HTMLCanvasElement>(null);
    const intervalRef = React.useRef<any>(null);

    // State Alur 3 Sudut Pendaftaran Wajah (Depan, Kanan, Kiri)
    const [enrollStep, setEnrollStep] = useState<'front' | 'right' | 'left' | 'completed'>('front');
    const [capturedAngles, setCapturedAngles] = useState<{
      front: number[] | null;
      right: number[] | null;
      left: number[] | null;
    }>({ front: null, right: null, left: null });
    const [isSavingEnroll, setIsSavingEnroll] = useState(false);

    // State untuk Absensi Harian
    const [activeSchedules, setActiveSchedules] = useState<any[]>([]);
    const [selectedSchedule, setSelectedSchedule] = useState('');
    const [isAttendOpen, setIsAttendOpen] = useState(false);
    const [attendFaceDetected, setAttendFaceDetected] = useState(false);
    const [attendStatus, setAttendStatus] = useState('Pilih jadwal lalu buka kamera.');
    const [locationData, setLocationData] = useState<{ lat?: number; lng?: number; info: string }>({ info: 'Mencari lokasi...' });
    const [attendSuccessData, setAttendSuccessData] = useState<any>(null);
    const [attendErrorData, setAttendErrorData] = useState<string | null>(null);
    const [myHistory, setMyHistory] = useState<any>(null);
    const attendWebcamRef = React.useRef<any>(null);
    const attendCanvasRef = React.useRef<HTMLCanvasElement>(null);
    const attendIntervalRef = React.useRef<any>(null);
    const lastDescriptorRef = React.useRef<Float32Array | null>(null);

    const loadMyAttendanceHistory = () => {
      const token = localStorage.getItem('token');
      fetch(`http://localhost:5000/api/face/student-history/${user.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(res => res.json())
        .then(data => {
          if (data && data.student) {
            setMyHistory(data);
          }
        })
        .catch(err => console.error('Gagal load riwayat absensi:', err));
    };

    React.useEffect(() => {
      loadMyAttendanceHistory();

      // 1. Load Model Face API
      import('face-api.js').then(async (faceapi) => {
        try {
          const MODEL_URL = '/models';
          await Promise.all([
            faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
            faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
            faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
          ]);
          setModelsLoaded(true);
          setStatusText('');
        } catch (e) {
          setStatusText('❌ Gagal memuat model AI');
        }
      });

      // 2. Load Jadwal Aktif
      const token = localStorage.getItem('token');
      fetch('http://localhost:5000/api/face/schedules/active', {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data) && data.length > 0) {
            setActiveSchedules(data);
            setSelectedSchedule(String(data[0].id));
          }
        })
        .catch(err => console.error('Gagal load jadwal aktif:', err));

      // 3. Ambil Lokasi GPS Pengguna
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          pos => {
            setLocationData({
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              info: `Lat: ${pos.coords.latitude.toFixed(4)}, Lng: ${pos.coords.longitude.toFixed(4)}`
            });
          },
          () => {
            setLocationData({ info: 'GPS Kampus Default (Radius Valid)' });
          }
        );
      } else {
        setLocationData({ info: 'Geolocation tidak didukung' });
      }

      return () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
        if (attendIntervalRef.current) clearInterval(attendIntervalRef.current);
      };
    }, []);

    const handleVideoPlay = () => {
      setStatusText('🔍 Mendeteksi Wajah...');

      intervalRef.current = setInterval(async () => {
        if (webcamRef.current?.video?.readyState === 4) {
          const video = webcamRef.current.video;
          const faceapi = await import('face-api.js');

          const detections = await faceapi.detectAllFaces(video)
            .withFaceLandmarks()
            .withFaceDescriptors();

          const canvas = canvasRef.current;
          if (canvas) {
            const displaySize = { width: video.videoWidth, height: video.videoHeight };
            faceapi.matchDimensions(canvas, displaySize);
            const resized = faceapi.resizeResults(detections, displaySize);
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.clearRect(0, 0, canvas.width, canvas.height);
              faceapi.draw.drawDetections(canvas, resized);
              faceapi.draw.drawFaceLandmarks(canvas, resized);
            }
            if (detections.length > 0) {
              setFaceDetected(true);
              const angleName = enrollStep === 'front' ? 'DEPAN' : enrollStep === 'right' ? 'KANAN (Tengok Kanan)' : 'KIRI (Tengok Kiri)';
              setStatusText(`✅ Wajah Terdeteksi! Ambil scan sudut ${angleName}.`);
            } else {
              setFaceDetected(false);
              setStatusText('🔍 Mencari Wajah...');
            }
          }
        }
      }, 500);
    };

    // Fungsi Pengambilan Scan per Sudut: Depan -> Kanan -> Kiri
    const handleCaptureStep = async () => {
      if (!webcamRef.current?.video) return;
      const video = webcamRef.current.video;
      const faceapi = await import('face-api.js');

      setStatusText(`⏳ Mengekstrak sudut ${enrollStep}...`);
      const detection = await faceapi.detectSingleFace(video)
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!detection) {
        setStatusText('❌ Wajah tidak terdeteksi jelas. Pastikan pencahayaan cukup.');
        return;
      }

      const descriptor = Array.from(detection.descriptor);

      if (enrollStep === 'front') {
        setCapturedAngles(prev => ({ ...prev, front: descriptor }));
        setEnrollStep('right');
        setStatusText('✓ Sudut Depan Berhasil! Sekarang arahkan wajah menoleh ke KANAN.');
      } else if (enrollStep === 'right') {
        setCapturedAngles(prev => ({ ...prev, right: descriptor }));
        setEnrollStep('left');
        setStatusText('✓ Sudut Kanan Berhasil! Sekarang arahkan wajah menoleh ke KIRI.');
      } else if (enrollStep === 'left') {
        const finalAngles = {
          front: capturedAngles.front || descriptor,
          right: capturedAngles.right || descriptor,
          left: descriptor
        };
        setCapturedAngles(finalAngles);
        setEnrollStep('completed');
        setStatusText('✓ 3 Sudut Lengkap! Menyimpan ke database...');
        await submitFinalEnrollment(finalAngles);
      }
    };

    // Simpan hasil 3 sudut ke database MySQL
    const submitFinalEnrollment = async (angles: { front: number[]; right: number[]; left: number[] }) => {
      setIsSavingEnroll(true);
      try {
        const token = localStorage.getItem('token');
        const response = await fetch('http://localhost:5000/api/face/enroll', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            studentId: user.id,
            angles
          })
        });
        const data = await response.json();
        if (response.ok) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          setIsCameraOpen(false);
          setFaceDetected(false);
          setStatusText(`🎉 ${data.message}`);
        } else {
          setStatusText('❌ Gagal: ' + data.message);
        }
      } catch {
        setStatusText('❌ Gagal terhubung ke server backend');
      } finally {
        setIsSavingEnroll(false);
      }
    };

    const handleResetEnrollment = () => {
      setEnrollStep('front');
      setCapturedAngles({ front: null, right: null, left: null });
      setStatusText('Pendaftaran diulang. Posisikan wajah menghadap depan.');
    };

    // Fungsi kamera absensi harian
    const handleAttendVideoPlay = () => {
      setAttendStatus('🔍 Kamera aktif. Menangkap wajah...');
      attendIntervalRef.current = setInterval(async () => {
        if (attendWebcamRef.current?.video?.readyState === 4) {
          const video = attendWebcamRef.current.video;
          const faceapi = await import('face-api.js');
          const detections = await faceapi.detectAllFaces(video).withFaceLandmarks().withFaceDescriptors();
          const canvas = attendCanvasRef.current;
          if (canvas) {
            const displaySize = { width: video.videoWidth, height: video.videoHeight };
            faceapi.matchDimensions(canvas, displaySize);
            const resized = faceapi.resizeResults(detections, displaySize);
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.clearRect(0, 0, canvas.width, canvas.height);
              faceapi.draw.drawDetections(canvas, resized);
              faceapi.draw.drawFaceLandmarks(canvas, resized);
            }
            if (detections.length > 0) {
              lastDescriptorRef.current = detections[0].descriptor;
              setAttendFaceDetected(true);
              setAttendStatus('✅ Wajah terdeteksi! Siap dicocokkan (Ambang batas >85%).');
            } else {
              lastDescriptorRef.current = null;
              setAttendFaceDetected(false);
              setAttendStatus('🔍 Mengarahkan wajah ke kamera...');
            }
          }
        }
      }, 500);
    };

    const handleAttend = async () => {
      setAttendErrorData(null);
      setAttendSuccessData(null);

      const currentDescriptor = lastDescriptorRef.current;
      if (!currentDescriptor) {
        setAttendErrorData('Wajah tidak terdeteksi oleh kamera! Pastikan wajah berada tepat di dalam bingkai.');
        return;
      }

      setAttendStatus('⏳ Mencocokkan wajah dengan seluruh data 5 mahasiswa...');

      try {
        const token = localStorage.getItem('token');

        // Ambil SEMUA embedding 5 mahasiswa dari server
        const embRes = await fetch('http://localhost:5000/api/face/all-embeddings', {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (!embRes.ok) {
          setAttendErrorData('Gagal mengambil data embedding referensi dari server.');
          return;
        }

        const allEmbeddings: any[] = await embRes.json();

        if (allEmbeddings.length === 0) {
          setAttendErrorData('Belum ada mahasiswa yang mendaftarkan wajah (Enrollment). Silakan daftarkan wajah terlebih dahulu.');
          return;
        }

        const faceapi = await import('face-api.js');

        // Cari mahasiswa yang paling mirip (Euclidean Distance terkecil)
        let bestMatch: any = null;
        let bestDistance = Infinity;

        for (const record of allEmbeddings) {
          // Dukung multi-angle jika ada
          const descriptorsToCheck = record.allAngles && record.allAngles.length > 0 
            ? record.allAngles 
            : [record.embedding];

          for (const angleEmb of descriptorsToCheck) {
            const storedDescriptor = new Float32Array(angleEmb);
            const distance = faceapi.euclideanDistance(currentDescriptor, storedDescriptor);
            if (distance < bestDistance) {
              bestDistance = distance;
              bestMatch = record;
            }
          }
        }

        // Kalkulasi confidence score (tingkat kemiripan)
        // distance 0 = 100%, distance 0.4 = ~86%, distance 0.5 = ~82%
        const confidence = Math.min(0.99, Math.max(0, 1 - (bestDistance * 0.35)));
        const confidencePercent = (confidence * 100).toFixed(1);

        // AMBANG BATAS: Minimal 85% (> 85%)
        if (confidence < 0.85) {
          setAttendErrorData(
            `Wajah tidak cocok! Tingkat kemiripan hanya ${confidencePercent}% (di bawah ambang batas minimal 85%). Wajah tidak cocok, silakan coba lagi.`
          );
          setAttendStatus('❌ Wajah tidak cocok (< 85%). Silakan coba lagi.');
          return;
        }

        // Ambil snapshot foto saat presensi berlangsung (untuk verifikasi visual admin)
        const snapshot = attendWebcamRef.current?.getScreenshot ? attendWebcamRef.current.getScreenshot() : null;

        // Validasi Lokasi & Waktu via Backend /attend
        const res = await fetch('http://localhost:5000/api/face/attend', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            userId: bestMatch.userId,
            scheduleId: parseInt(selectedSchedule),
            confidenceScore: confidence,
            latitude: locationData.lat || null,
            longitude: locationData.lng || null,
            faceSnapshot: snapshot
          })
        });

        const data = await res.json();
        if (res.ok && data.success) {
          if (attendIntervalRef.current) clearInterval(attendIntervalRef.current);
          setIsAttendOpen(false);
          setAttendSuccessData(data.details);
          setAttendStatus(`🎉 Presensi Berhasil! ${data.details.name} (${data.details.statusLabel})`);
          loadMyAttendanceHistory();
        } else {
          setAttendErrorData(data.message || 'Gagal memproses absensi.');
          setAttendStatus('❌ Presensi ditolak: ' + data.message);
        }
      } catch (err) {
        console.error('Attend error:', err);
        setAttendErrorData('Terjadi kesalahan saat menghubungi server.');
      }
    };

    return (
      <div>
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">Dashboard Mahasiswa: Modul Absensi Face Recognition</h2>
            <p className="text-xs text-gray-500 mt-1">Sistem Pengenalan Wajah Otomatis & Geofencing Kampus</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                loadMyAttendanceHistory();
                const token = localStorage.getItem('token');
                fetch('http://localhost:5000/api/face/schedules/active', {
                  headers: { Authorization: `Bearer ${token}` }
                })
                  .then(res => res.json())
                  .then(data => {
                    if (Array.isArray(data) && data.length > 0) setActiveSchedules(data);
                  });
              }}
              className="px-3 py-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-xl text-xs font-semibold shadow-sm flex items-center gap-1.5 transition"
            >
              🔄 Refresh Status
            </button>
            <div className="bg-white px-3.5 py-2 rounded-xl shadow-sm border text-xs text-gray-600 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse"></span>
              <span>📍 {locationData.info}</span>
            </div>
          </div>
        </div>

        {/* KARTU STATUS PRESENSI HARIAN & WAKTU TERAKHIR ABSEN */}
        <div className="mb-6 bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`p-3 rounded-xl text-xl ${myHistory?.lastAttendance ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
              {myHistory?.lastAttendance ? '🗓️' : '⏳'}
            </div>
            <div>
              <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">Status Presensi Terakhir Anda</p>
              {myHistory?.lastAttendance ? (
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase ${myHistory.lastAttendance.status === 'hadir' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                    {myHistory.lastAttendance.status === 'hadir' ? 'Hadir Tepat Waktu' : myHistory.lastAttendance.status}
                  </span>
                  <span className="text-xs text-gray-600 font-medium">
                    ({myHistory.lastAttendance.course_name} - {myHistory.lastAttendance.class_name})
                  </span>
                </div>
              ) : (
                <p className="text-xs text-gray-700 font-bold mt-0.5">Belum ada riwayat absensi (Silakan lakukan absensi harian di bawah)</p>
              )}
            </div>
          </div>

          <div className="bg-gray-50 px-4 py-2.5 rounded-xl border border-gray-200 text-xs">
            <p className="text-gray-400 text-[10px]">Tanggal & Waktu Terakhir Absen:</p>
            {myHistory?.lastAttendance ? (
              <p className="font-bold text-gray-800">
                {new Date(myHistory.lastAttendance.recorded_at).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                <span className="text-brand-pink ml-1">
                  • Pukul {new Date(myHistory.lastAttendance.recorded_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB
                </span>
              </p>
            ) : (
              <p className="font-semibold text-gray-400">-</p>
            )}
          </div>
        </div>

        {/* NOTIFIKASI BERHASIL POPUP / CARD */}
        {attendSuccessData && (
          <div className="mb-6 p-6 bg-green-50 border-2 border-green-400 rounded-2xl shadow-md transition-all">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <span className="text-3xl">🎉</span>
                <div>
                  <h3 className="text-lg font-bold text-green-800">Presensi Berhasil Dicatat!</h3>
                  <p className="text-sm text-green-700">Wajah cocok & terverifikasi oleh Face Recognition Engine</p>
                </div>
              </div>
              <button
                onClick={() => setAttendSuccessData(null)}
                className="text-green-700 hover:text-green-900 font-bold text-lg"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4 bg-white p-4 rounded-xl border border-green-200 text-xs">
              <div>
                <p className="text-gray-500">Mahasiswa</p>
                <p className="font-bold text-gray-800 text-sm">{attendSuccessData.name}</p>
                <p className="font-mono text-gray-500">{attendSuccessData.nim}</p>
              </div>
              <div>
                <p className="text-gray-500">Status Kehadiran</p>
                <span className={`inline-block px-2.5 py-1 rounded-full font-bold uppercase mt-1 ${attendSuccessData.status === 'hadir' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                  {attendSuccessData.status}
                </span>
                <p className="text-[10px] text-gray-400 mt-0.5">{attendSuccessData.statusLabel}</p>
              </div>
              <div>
                <p className="text-gray-500">Kemiripan Wajah</p>
                <p className="font-bold text-brand-pink text-sm mt-1">{attendSuccessData.confidence}</p>
                <p className="text-[10px] text-green-600 font-semibold">Memenuhi ambang &gt;85%</p>
              </div>
              <div>
                <p className="text-gray-500">Waktu & Lokasi</p>
                <p className="font-bold text-gray-700 mt-1">{attendSuccessData.time} WIB</p>
                <p className="text-[10px] text-gray-400">{attendSuccessData.location}</p>
              </div>
            </div>
          </div>
        )}

        {/* NOTIFIKASI ERROR / TIDAK COCOK */}
        {attendErrorData && (
          <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 rounded-xl flex items-center justify-between text-sm text-red-700">
            <div className="flex items-center gap-3">
              <span className="text-2xl">⚠️</span>
              <div>
                <p className="font-bold">Verifikasi Absensi Gagal!</p>
                <p>{attendErrorData}</p>
              </div>
            </div>
            <button onClick={() => setAttendErrorData(null)} className="font-bold text-red-600 hover:text-red-800">
              ✕
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* KOTAK KIRI: Enrollment 3 Sudut */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-brand-pink/30">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="bg-brand-light-pink p-3 rounded-lg"><span className="text-xl">👤</span></div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-700">1. Pendaftaran Wajah (Enrollment)</h3>
                  <p className="text-[11px] text-gray-500">Scan 3 Sudut Wajah: Depan, Kanan, dan Kiri</p>
                </div>
              </div>
              {capturedAngles.front && (
                <button
                  onClick={handleResetEnrollment}
                  className="text-[11px] text-red-500 hover:underline font-semibold"
                >
                  Ulangi
                </button>
              )}
            </div>

            {/* Stepper Indikator 3 Sudut */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              <div className={`p-2 rounded-xl text-center border text-xs font-bold transition ${capturedAngles.front ? 'bg-green-100 border-green-400 text-green-800' : enrollStep === 'front' ? 'bg-pink-100 border-brand-pink text-brand-dark animate-pulse' : 'bg-gray-50 text-gray-400'}`}>
                {capturedAngles.front ? '✓ 1. Depan' : '1. Depan'}
              </div>
              <div className={`p-2 rounded-xl text-center border text-xs font-bold transition ${capturedAngles.right ? 'bg-green-100 border-green-400 text-green-800' : enrollStep === 'right' ? 'bg-pink-100 border-brand-pink text-brand-dark animate-pulse' : 'bg-gray-50 text-gray-400'}`}>
                {capturedAngles.right ? '✓ 2. Kanan' : '2. Kanan'}
              </div>
              <div className={`p-2 rounded-xl text-center border text-xs font-bold transition ${capturedAngles.left ? 'bg-green-100 border-green-400 text-green-800' : enrollStep === 'left' ? 'bg-pink-100 border-brand-pink text-brand-dark animate-pulse' : 'bg-gray-50 text-gray-400'}`}>
                {capturedAngles.left ? '✓ 3. Kiri' : '3. Kiri'}
              </div>
            </div>

            {statusText && (
              <div className="text-xs font-semibold text-brand-pink mb-4 bg-brand-light-pink p-2 rounded text-center">
                {statusText}
              </div>
            )}

            <div className="w-full h-48 bg-gray-100 rounded-xl flex items-center justify-center border-2 border-dashed border-gray-300 mb-4 overflow-hidden relative">
              {isCameraOpen ? (
                <>
                  <Webcam
                    ref={webcamRef}
                    audio={false}
                    screenshotFormat="image/jpeg"
                    className="w-full h-full object-cover absolute top-0 left-0"
                    onUserMedia={handleVideoPlay}
                  />
                  <canvas ref={canvasRef} className="absolute top-0 left-0 w-full h-full" style={{ pointerEvents: 'none' }} />
                </>
              ) : (
                <span className="text-gray-400 text-sm">Kamera Pendaftaran Mati</span>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <button
                onClick={() => {
                  if (!modelsLoaded) return alert('Tunggu model AI selesai dimuat!');
                  if (intervalRef.current) clearInterval(intervalRef.current);
                  setIsCameraOpen(prev => !prev);
                  setFaceDetected(false);
                }}
                disabled={!modelsLoaded}
                className={`w-full text-white py-2 rounded-lg transition font-medium ${modelsLoaded ? 'bg-brand-pink hover:bg-brand-dusty-pink' : 'bg-gray-300 cursor-not-allowed'}`}
              >
                {isCameraOpen ? 'Tutup Kamera' : 'Buka Kamera & Mulai Pendaftaran'}
              </button>

              {isCameraOpen && faceDetected && enrollStep !== 'completed' && (
                <button
                  onClick={handleCaptureStep}
                  disabled={isSavingEnroll}
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white py-2 rounded-lg transition font-semibold shadow flex items-center justify-center gap-2"
                >
                  <span>📷</span>
                  <span>
                    {enrollStep === 'front' && '1. Rekam Wajah Depan'}
                    {enrollStep === 'right' && '2. Rekam Wajah Kanan (Menoleh Kanan)'}
                    {enrollStep === 'left' && '3. Rekam Wajah Kiri (Menoleh Kiri) & Simpan'}
                  </span>
                </button>
              )}

              {enrollStep === 'completed' && (
                <div className="p-3 bg-green-50 border border-green-300 rounded-xl text-center text-xs text-green-800 font-bold">
                  🎉 Seluruh 3 Sudut Wajah Berhasil Disimpan ke Database!
                </div>
              )}
            </div>
          </div>

          {/* KOTAK KANAN: Absensi Harian */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-brand-pink/30">
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-green-100 p-3 rounded-lg"><span className="text-xl">📷</span></div>
              <h3 className="text-lg font-semibold text-gray-700">2. Absensi Harian (Recognition)</h3>
            </div>
            <p className="text-sm text-gray-500 mb-3">
              Pilih jadwal aktif, arahkan wajah ke kamera. Sistem mencocokkan wajah dengan ambang batas <strong>&gt;85%</strong> dan validasi waktu & lokasi.
            </p>

            <div className="mb-3">
              <label className="block text-xs font-semibold text-gray-600 mb-1">Pilih Jadwal Aktif:</label>
              <select
                value={selectedSchedule}
                onChange={e => setSelectedSchedule(e.target.value)}
                className="w-full p-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-pink bg-white"
              >
                {activeSchedules.length === 0 ? (
                  <option value="1">Algoritma dan Pemrograman - TI-A (Pertemuan 1)</option>
                ) : (
                  activeSchedules.map(sch => (
                    <option key={sch.id} value={sch.id}>
                      {sch.course_name} ({sch.class_name}) - Pukul {sch.start_time.slice(0, 5)} - {sch.end_time.slice(0, 5)} WIB
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* Info Aturan Batasan Waktu */}
            <div className="mb-3 p-2 bg-blue-50 border border-blue-200 rounded-lg text-[11px] text-blue-800 flex items-center gap-2">
              <span>🕒</span>
              <span>
                <strong>Aturan Waktu:</strong> Sebelum jam 19:00 = <strong>Hadir Tepat Waktu</strong>. Lewat jam 19:00 (7 malam) = <strong>Terlambat</strong>.
              </span>
            </div>

            <div className="text-xs font-semibold text-green-700 mb-3 bg-green-50 p-2 rounded text-center">
              {attendStatus}
            </div>

            <div className="w-full h-48 bg-gray-100 rounded-xl flex items-center justify-center border-2 border-dashed border-gray-300 mb-4 overflow-hidden relative">
              {isAttendOpen ? (
                <>
                  <Webcam
                    ref={attendWebcamRef}
                    audio={false}
                    screenshotFormat="image/jpeg"
                    className="w-full h-full object-cover absolute top-0 left-0"
                    onUserMedia={handleAttendVideoPlay}
                  />
                  <canvas ref={attendCanvasRef} className="absolute top-0 left-0 w-full h-full" style={{ pointerEvents: 'none' }} />
                </>
              ) : (
                <span className="text-gray-400 text-sm">Kamera Absensi Mati</span>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <button
                onClick={() => {
                  if (!selectedSchedule) return alert('Pilih jadwal terlebih dahulu!');
                  if (!modelsLoaded) return alert('Tunggu model AI selesai dimuat!');
                  setIsAttendOpen(prev => !prev);
                  setAttendFaceDetected(false);
                }}
                className={`w-full text-white py-2 rounded-lg transition font-medium ${selectedSchedule ? 'bg-green-500 hover:bg-green-600' : 'bg-gray-300 cursor-not-allowed'}`}
              >
                {isAttendOpen ? 'Tutup Kamera' : 'Buka Kamera Absensi'}
              </button>

              {isAttendOpen && attendFaceDetected && (
                <button
                  onClick={handleAttend}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg transition font-semibold shadow"
                >
                  🔍 Cocokkan & Catat Hadir (Ambang &gt;85%)
                </button>
              )}
            </div>
          </div>

        </div>
      </div>
    );
  };

  // --- KOMPONEN POV DOSEN ---
  const LecturerPOV = () => {
    const [recapData, setRecapData] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchRecap = () => {
      const token = localStorage.getItem('token');
      fetch('http://localhost:5000/api/admin/recap', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
        .then(r => r.json())
        .then(data => {
          setRecapData(Array.isArray(data.recap) ? data.recap : []);
          setLoading(false);
        })
        .catch(err => {
          console.error(err);
          setLoading(false);
        });
    };

    React.useEffect(() => {
      fetchRecap();
    }, []);

    const exportToPDF = () => {
      const doc = new jsPDF();
      doc.setFontSize(16);
      doc.text('Laporan Rekap Kehadiran Mahasiswa & Syarat Ujian', 14, 18);
      doc.setFontSize(10);
      doc.text(`Mata Kuliah: Algoritma & Pemrograman (TI-A) | Dicetak: ${new Date().toLocaleString('id-ID')}`, 14, 25);
      doc.text('Ketentuan: Minimal Kehadiran 75% untuk Mengikuti Ujian', 14, 30);

      const tableData = recapData.map((row, idx) => [
        idx + 1,
        row.nim,
        row.name,
        `${row.totalHadir} / ${row.totalTarget}`,
        `${row.percentage}%`,
        row.examEligible ? 'LAYAK UJIAN' : 'TIDAK LAYAK'
      ]);

      autoTable(doc, {
        head: [['No', 'NIM', 'Nama Mahasiswa', 'Kehadiran', 'Persentase', 'Status Ujian']],
        body: tableData,
        startY: 35,
        theme: 'grid',
        headStyles: { fillColor: [244, 167, 197] },
      });

      doc.save(`Rekap_Kehadiran_TIA_${Date.now()}.pdf`);
    };

    const exportToExcel = () => {
      const exportRows = recapData.map((row, idx) => ({
        No: idx + 1,
        NIM: row.nim,
        'Nama Mahasiswa': row.name,
        'Program Studi': row.studyProgram,
        'Hadir': row.hadir,
        'Terlambat': row.terlambat,
        'Total Kehadiran': `${row.totalHadir} / ${row.totalTarget}`,
        'Persentase Kehadiran': `${row.percentage}%`,
        'Syarat Ujian (>=75%)': row.examEligible ? 'LAYAK MENGIKUTI UJIAN' : 'TIDAK MEMENUHI SYARAT',
      }));

      const worksheet = XLSX.utils.json_to_sheet(exportRows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Rekap Kehadiran');
      XLSX.writeFile(workbook, `Rekap_Kehadiran_TIA_${Date.now()}.xlsx`);
    };

    return (
      <div>
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">Dashboard Dosen: Monitoring Kelas & Pelaporan</h2>
            <p className="text-xs text-gray-500 mt-1">Mata Kuliah: Algoritma & Pemrograman - Kelas TI-A</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={exportToPDF}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow"
            >
              📄 Ekspor PDF
            </button>
            <button
              onClick={exportToExcel}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow"
            >
              📊 Ekspor Excel
            </button>
            <button
              onClick={fetchRecap}
              className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-semibold"
            >
              🔄 Refresh
            </button>
          </div>
        </div>

        {/* Ringkasan Syarat Ujian Banner */}
        <div className="mb-6 p-4 bg-purple-50 border border-purple-200 rounded-2xl flex items-center justify-between text-xs text-purple-900">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🎓</span>
            <div>
              <p className="font-bold text-sm">Ketentuan Syarat Mengikuti Ujian Semester</p>
              <p>Mahasiswa wajib memiliki persentase kehadiran <strong>minimal 75%</strong> untuk memperoleh kartu ujian.</p>
            </div>
          </div>
          <div className="bg-white px-4 py-2 rounded-xl border border-purple-200 font-bold">
            Target Pertemuan: 16 Sesi
          </div>
        </div>

        {/* Tabel Rekap Mahasiswa & Persentase */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-4 border-b flex justify-between items-center">
            <h3 className="font-semibold text-gray-700 text-sm">Rekap Kehadiran Real-time & Evaluasi Ujian</h3>
            <span className="text-xs text-gray-400">{recapData.length} Mahasiswa Terdaftar</span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-gray-50 border-b text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3">NIM</th>
                  <th className="px-4 py-3">Nama Mahasiswa</th>
                  <th className="px-4 py-3">Kehadiran</th>
                  <th className="px-4 py-3">Persentase</th>
                  <th className="px-4 py-3">Progres</th>
                  <th className="px-4 py-3">Syarat Mengikuti Ujian</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} className="text-center py-8 text-gray-400">Memuat rekap kehadiran...</td></tr>
                ) : recapData.map((row) => (
                  <tr key={row.studentId} className="border-b hover:bg-gray-50 transition">
                    <td className="px-4 py-3 font-mono text-xs font-semibold">{row.nim}</td>
                    <td className="px-4 py-3 font-medium text-gray-800">{row.name}</td>
                    <td className="px-4 py-3 text-xs text-gray-600">
                      {row.totalHadir} / {row.totalTarget} sesi 
                      <span className="text-gray-400 text-[10px] block">({row.hadir} tepat, {row.terlambat} telat)</span>
                    </td>
                    <td className="px-4 py-3 font-bold text-brand-dark">
                      {row.percentage}%
                    </td>
                    <td className="px-4 py-3 w-40">
                      <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
                        <div
                          className={`h-2.5 rounded-full ${row.percentage >= 75 ? 'bg-green-500' : 'bg-brand-pink'}`}
                          style={{ width: `${Math.min(100, Math.max(5, row.percentage))}%` }}
                        ></div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {row.examEligible ? (
                        <span className="px-3 py-1 rounded-full text-xs font-bold bg-green-100 text-green-800 flex items-center gap-1 w-fit">
                          ✓ Layak Ujian (≥75%)
                        </span>
                      ) : (
                        <span className="px-3 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700 flex items-center gap-1 w-fit">
                          ✕ Tidak Layak (&lt;75%)
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  // --- KOMPONEN POV ADMIN ---
  const AdminPOV = () => {
    const [stats, setStats] = useState<any>(null);
    const [attendance, setAttendance] = useState<any[]>([]);
    const [students, setStudents] = useState<any[]>([]);
    const [recapData, setRecapData] = useState<any[]>([]);
    const [activeTab, setActiveTab] = useState<'attendance' | 'recap' | 'students'>('attendance');
    const [loading, setLoading] = useState(true);

    const loadAdminData = () => {
      const token = localStorage.getItem('token');
      const headers = { 'Authorization': `Bearer ${token}` };

      Promise.all([
        fetch('http://localhost:5000/api/admin/stats', { headers }).then(r => r.json()),
        fetch('http://localhost:5000/api/admin/attendance', { headers }).then(r => r.json()),
        fetch('http://localhost:5000/api/admin/students', { headers }).then(r => r.json()),
        fetch('http://localhost:5000/api/admin/recap', { headers }).then(r => r.json()),
      ]).then(([statsData, attendanceData, studentsData, recapRes]) => {
        setStats(statsData);
        setAttendance(Array.isArray(attendanceData) ? attendanceData : []);
        setStudents(Array.isArray(studentsData) ? studentsData : []);
        setRecapData(Array.isArray(recapRes?.recap) ? recapRes.recap : []);
        setLoading(false);
      });
    };

    React.useEffect(() => {
      loadAdminData();
    }, []);

    const exportToPDF = () => {
      const doc = new jsPDF();
      doc.setFontSize(16);
      doc.text('Rekap Kehadiran Real-time & Syarat Ujian Mahasiswa', 14, 18);
      doc.setFontSize(10);
      doc.text(`Waktu Cetak: ${new Date().toLocaleString('id-ID')} | Standar Kehadiran: Minimal 75%`, 14, 25);

      const tableData = recapData.map((row, idx) => [
        idx + 1,
        row.nim,
        row.name,
        `${row.totalHadir}/${row.totalTarget}`,
        `${row.percentage}%`,
        row.examEligible ? 'LAYAK UJIAN' : 'TIDAK LAYAK'
      ]);

      autoTable(doc, {
        head: [['No', 'NIM', 'Nama', 'Kehadiran', 'Persentase', 'Status Ujian']],
        body: tableData,
        startY: 32,
        theme: 'grid',
        headStyles: { fillColor: [244, 167, 197] },
      });

      doc.save(`Rekap_Ujian_Admin_${Date.now()}.pdf`);
    };

    const exportToExcel = () => {
      const exportRows = recapData.map((row, idx) => ({
        No: idx + 1,
        NIM: row.nim,
        Nama: row.name,
        'Program Studi': row.studyProgram,
        'Hadir Tepat': row.hadir,
        'Terlambat': row.terlambat,
        'Total Kehadiran': `${row.totalHadir} / ${row.totalTarget}`,
        'Persentase Kehadiran': `${row.percentage}%`,
        'Syarat Ujian': row.examEligible ? 'LAYAK' : 'TIDAK LAYAK',
      }));

      const worksheet = XLSX.utils.json_to_sheet(exportRows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Rekap Kelayakan Ujian');
      XLSX.writeFile(workbook, `Rekap_Ujian_Admin_${Date.now()}.xlsx`);
    };

    if (loading) return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-400 text-lg">⏳ Memuat data dari server...</p>
      </div>
    );

    return (
      <div>
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">Dashboard Admin: Master Data, Monitoring & Pelaporan</h2>
            <p className="text-xs text-gray-500 mt-1">Audit Trail Real-time & Kelayakan Ujian Mahasiswa</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={exportToPDF}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow"
            >
              📄 Ekspor PDF
            </button>
            <button
              onClick={exportToExcel}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow"
            >
              📊 Ekspor Excel
            </button>
            <button
              onClick={loadAdminData}
              className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-semibold"
            >
              🔄 Refresh
            </button>
          </div>
        </div>

        {/* Stats Cards - Data Real dari DB */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white p-5 rounded-2xl shadow-sm border-l-4 border-brand-pink">
            <p className="text-xs text-gray-500 mb-1">Total Mahasiswa</p>
            <p className="text-3xl font-bold text-gray-800">{stats?.totalMahasiswa ?? 0}</p>
          </div>
          <div className="bg-white p-5 rounded-2xl shadow-sm border-l-4 border-blue-400">
            <p className="text-xs text-gray-500 mb-1">Total Dosen</p>
            <p className="text-3xl font-bold text-gray-800">{stats?.totalDosen ?? 0}</p>
          </div>
          <div className="bg-white p-5 rounded-2xl shadow-sm border-l-4 border-green-400">
            <p className="text-xs text-gray-500 mb-1">Absensi Hari Ini</p>
            <p className="text-3xl font-bold text-gray-800">{stats?.totalAbsensiHariIni ?? 0}</p>
          </div>
          <div className="bg-white p-5 rounded-2xl shadow-sm border-l-4 border-purple-400">
            <p className="text-xs text-gray-500 mb-1">Wajah Terdaftar</p>
            <p className="text-3xl font-bold text-gray-800">{stats?.totalTerdaftarWajah ?? 0}</p>
          </div>
        </div>

        {/* Tab Navigasi */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setActiveTab('attendance')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${activeTab === 'attendance' ? 'bg-brand-pink text-white' : 'bg-white border text-gray-600 hover:bg-gray-50'}`}
          >
            📋 Log Absensi Real-time
          </button>
          <button
            onClick={() => setActiveTab('recap')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${activeTab === 'recap' ? 'bg-brand-pink text-white' : 'bg-white border text-gray-600 hover:bg-gray-50'}`}
          >
            🎓 Rekap Persentase & Syarat Ujian (75%)
          </button>
          <button
            onClick={() => setActiveTab('students')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${activeTab === 'students' ? 'bg-brand-pink text-white' : 'bg-white border text-gray-600 hover:bg-gray-50'}`}
          >
            👤 Data Mahasiswa (Status Enrollment)
          </button>
        </div>

        {/* Tab 1: Log Absensi Real-time */}
        {activeTab === 'attendance' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-4 border-b flex justify-between items-center">
              <h3 className="font-semibold text-gray-700 text-sm">Riwayat Aktivitas Presensi Wajah</h3>
              <span className="text-xs text-gray-400">{attendance.length} catatan aktivitas</span>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm text-left">
                <thead className="bg-gray-50 border-b text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-3">Foto Wajah</th>
                    <th className="px-4 py-3">NIM</th>
                    <th className="px-4 py-3">Nama</th>
                    <th className="px-4 py-3">Mata Kuliah</th>
                    <th className="px-4 py-3">Kelas</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Confidence</th>
                    <th className="px-4 py-3">Waktu</th>
                  </tr>
                </thead>
                <tbody>
                  {attendance.length === 0 ? (
                    <tr><td colSpan={8} className="text-center py-8 text-gray-400">Belum ada data presensi hari ini</td></tr>
                  ) : attendance.map((row: any) => (
                    <tr key={row.id} className="border-b hover:bg-gray-50 transition">
                      <td className="px-4 py-2">
                        {row.face_snapshot ? (
                          <img
                            src={row.face_snapshot}
                            alt={row.student_name}
                            className="w-10 h-10 rounded-full object-cover border-2 border-brand-pink shadow-sm"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-brand-light-pink text-brand-dark flex items-center justify-center font-bold text-xs">
                            {row.student_name ? row.student_name.charAt(0) : '👤'}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{row.nim}</td>
                      <td className="px-4 py-3 font-medium">{row.student_name}</td>
                      <td className="px-4 py-3 text-gray-600">{row.course_name}</td>
                      <td className="px-4 py-3">{row.class_name}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-bold ${row.status === 'hadir' ? 'bg-green-100 text-green-700' : row.status === 'terlambat' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                          {row.status === 'hadir' ? 'Tepat Waktu' : row.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{row.confidence_score ? `${(row.confidence_score * 100).toFixed(1)}%` : '-'}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">{new Date(row.recorded_at).toLocaleString('id-ID')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 2: Rekap Persentase & Syarat Ujian */}
        {activeTab === 'recap' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-4 border-b flex justify-between items-center bg-gray-50/50">
              <div>
                <h3 className="font-semibold text-gray-700 text-sm">Persentase Kehadiran & Kelayakan Ujian</h3>
                <p className="text-xs text-gray-400">Ambang Batas Kehadiran Minimal: 75% dari total 16 pertemuan</p>
              </div>
              <span className="text-xs font-bold text-brand-dark bg-brand-light-pink px-2.5 py-1 rounded-lg">
                Standar Akademik Kampus
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-gray-50 border-b text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-3">NIM</th>
                    <th className="px-4 py-3">Nama Mahasiswa</th>
                    <th className="px-4 py-3">Hadir / Terlambat</th>
                    <th className="px-4 py-3">Total Kehadiran</th>
                    <th className="px-4 py-3">Persentase</th>
                    <th className="px-4 py-3">Syarat Ujian</th>
                  </tr>
                </thead>
                <tbody>
                  {recapData.map((row) => (
                    <tr key={row.studentId} className="border-b hover:bg-gray-50 transition">
                      <td className="px-4 py-3 font-mono text-xs font-semibold">{row.nim}</td>
                      <td className="px-4 py-3 font-medium text-gray-800">{row.name}</td>
                      <td className="px-4 py-3 text-xs text-gray-600">
                        <span className="text-green-600 font-semibold">{row.hadir} Hadir</span>, <span className="text-yellow-600 font-semibold">{row.terlambat} Telat</span>
                      </td>
                      <td className="px-4 py-3 text-xs font-medium">
                        {row.totalHadir} dari {row.totalTarget} Pertemuan
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs w-10">{row.percentage}%</span>
                          <div className="w-24 bg-gray-200 rounded-full h-2 overflow-hidden">
                            <div
                              className={`h-2 rounded-full ${row.percentage >= 75 ? 'bg-green-500' : 'bg-brand-pink'}`}
                              style={{ width: `${Math.min(100, Math.max(5, row.percentage))}%` }}
                            ></div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {row.examEligible ? (
                          <span className="px-3 py-1 rounded-full text-xs font-bold bg-green-100 text-green-800">
                            ✓ Memenuhi Syarat (≥75%)
                          </span>
                        ) : (
                          <span className="px-3 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700">
                            ✕ Belum Memenuhi (&lt;75%)
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 3: Daftar Mahasiswa & Status Wajah */}
        {activeTab === 'students' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-4 border-b flex justify-between items-center">
              <h3 className="font-semibold text-gray-700 text-sm">Daftar Mahasiswa & Status Pendaftaran Wajah</h3>
              <span className="text-xs text-gray-400">{students.length} Mahasiswa Terdaftar</span>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm text-left">
                <thead className="bg-gray-50 border-b text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-3">NIM</th>
                    <th className="px-4 py-3">Nama</th>
                    <th className="px-4 py-3">Program Studi</th>
                    <th className="px-4 py-3">Status Pendaftaran Wajah</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((s: any) => (
                    <tr key={s.id} className="border-b hover:bg-gray-50 transition">
                      <td className="px-4 py-3 font-mono text-xs">{s.nim}</td>
                      <td className="px-4 py-3 font-medium">{s.name}</td>
                      <td className="px-4 py-3 text-gray-600">{s.study_program}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold w-fit ${s.face_status === 'Terdaftar' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                            {s.face_status === 'Terdaftar' ? '✅ Wajah Terdaftar' : '❌ Belum Enrollment'}
                          </span>
                          {s.angles && s.face_status === 'Terdaftar' && (
                            <div className="flex gap-1 text-[10px]">
                              <span className={`px-1.5 py-0.5 rounded ${s.angles.front ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-400'}`}>
                                Depan
                              </span>
                              <span className={`px-1.5 py-0.5 rounded ${s.angles.right ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-400'}`}>
                                Kanan
                              </span>
                              <span className={`px-1.5 py-0.5 rounded ${s.angles.left ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-400'}`}>
                                Kiri
                              </span>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <div className="w-64 bg-white shadow-md flex flex-col h-screen fixed">
        <div className="p-6">
          <h2 className="text-2xl font-bold text-brand-pink">AbsensiApp</h2>
        </div>
        <div className="px-6 py-4 flex flex-col items-center border-b">
          <div className="w-16 h-16 bg-gray-200 rounded-full mb-2"></div>
          <p className="font-semibold">{user.username}</p>
          <p className="text-xs text-brand-pink uppercase tracking-widest font-bold bg-brand-light-pink px-2 py-1 rounded mt-1">{role}</p>
        </div>
        <nav className="mt-4 px-4 flex-1">
          <a href="#" className="block px-4 py-3 bg-brand-pink text-white rounded-xl font-medium shadow-md">
            Dashboard Utama
          </a>
        </nav>
        <div className="p-4 border-t">
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center px-4 py-3 bg-red-50 text-red-600 rounded-xl font-medium hover:bg-red-100 transition"
          >
            Keluar (Logout)
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-10 ml-64">
        {role === 'mahasiswa' && <StudentPOV />}
        {role === 'dosen' && <LecturerPOV />}
        {role === 'admin' && <AdminPOV />}
      </div>
    </div>
  );
};

export default DashboardPage;
