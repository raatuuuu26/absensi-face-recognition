import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

const LoginPage = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    try {
      const response = await axios.post('http://localhost:5000/api/auth/login', {
        username,
        password
      });
      
      // Simpan token dan data user ke localStorage
      localStorage.setItem('token', response.data.token);
      localStorage.setItem('user', JSON.stringify(response.data.user));
      
      // Pindah ke dashboard
      navigate('/dashboard');
    } catch (error: any) {
      if (error.response && error.response.data.message) {
        setErrorMsg(error.response.data.message);
      } else {
        setErrorMsg('Gagal terhubung ke server');
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-brand-light-pink px-4">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8 border border-brand-pink/20">
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-brand-pink rounded-full flex items-center justify-center mx-auto mb-4 shadow-md">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-3xl font-bold text-brand-dark">Sistem Absensi</h2>
          <p className="text-sm text-gray-500 mt-2">Face Recognition & Geofencing</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">NIM / NIDN / ID Admin</label>
            <input 
              type="text" 
              className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-pink focus:border-transparent transition-all"
              placeholder="Masukkan ID Anda"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Kata Sandi</label>
            <input 
              type="password" 
              className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-pink focus:border-transparent transition-all"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {errorMsg && (
            <div className="bg-red-50 text-red-500 text-sm p-3 rounded-lg border border-red-200">
              {errorMsg}
            </div>
          )}

          <button 
            type="submit" 
            className="w-full bg-brand-pink text-white font-bold py-3 px-4 rounded-xl hover:bg-brand-dusty-pink transition-colors shadow-md hover:shadow-lg"
          >
            Masuk
          </button>
        </form>
        
        <div className="mt-6 text-center text-sm text-gray-500">
          <p>Jika lupa kata sandi, silakan hubungi Administrator.</p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
