import React, { useState, useEffect, useRef } from 'react';
import { ViewMode, Medication, MedicationItem } from './types';
import DoctorDashboard from './components/DoctorDashboard';
import PatientDashboard from './components/PatientDashboard';
import { importShareCode, getMedications } from './services/storageService';

const App: React.FC = () => {
  // State to determine which screen to show (Selection, Doctor, or Patient).
  // 決定顯示哪個畫面的狀態 (選擇頁面、醫師後台、或病人前台)。
  const [view, setView] = useState<ViewMode>(ViewMode.SELECTION);

  // Global Notification State
  const [medications, setMedications] = useState<Medication[]>([]);
  const [activeNotification, setActiveNotification] = useState<Medication | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastTriggeredRef = useRef<string | null>(null);

  // Helper to refresh data
  const refreshMedications = () => {
    setMedications(getMedications());
  };

  // Effect: Check for "Magic Link" import on app start.
  // Effect: App 啟動時檢查是否有「神奇連結」匯入參數。
  useEffect(() => {
    // Load initial data
    refreshMedications();

    // 1. Get URL search params
    const params = new URLSearchParams(window.location.search);
    const importData = params.get('import');

    if (importData) {
      console.log("Detected import code in URL...");
      // 2. Try to import the data
      const success = importShareCode(importData);

      if (success) {
        // 3. If successful, clear the URL (so refreshing doesn't re-import) and switch to Patient view.
        // 3. 若成功，清除網址參數 (避免重新整理時重複匯入)，並切換至病人模式。
        window.history.replaceState({}, document.title, window.location.pathname);
        alert("✅ 成功匯入家屬設定的提醒！\n\n因為連結無法傳送大檔案，請協助長輩重新拍攝藥物照片喔！");
        refreshMedications(); // Refresh data after import
        setView(ViewMode.PATIENT);
      } else {
        alert("❌ 連結無效或是格式錯誤。");
      }
    }
  }, []);

  // Global Timer for Notifications
  useEffect(() => {
    const timer = setInterval(() => {
      // Re-fetch medications every tick to ensure we have latest data even if modified in Doctor view
      // 每次計時都重新讀取，確保即使在醫師後台修改過也能取得最新資料
      const currentMeds = getMedications();
      setMedications(currentMeds);

      const now = new Date();
      checkSchedule(now, currentMeds);
    }, 2000);
    return () => clearInterval(timer);
  }, []);

  const checkSchedule = (now: Date, meds: Medication[]) => {
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const timeString = `${hours}:${minutes}`;

    const match = meds.find(m => m.time === timeString);
    if (match) {
      const triggerKey = `${match.id}-${timeString}`;
      // Prevent double triggering for the same minute
      if (lastTriggeredRef.current !== triggerKey && !activeNotification) {
        lastTriggeredRef.current = triggerKey;
        triggerNotification(match);
      }
    }
  };

  const triggerNotification = (med: Medication) => {
    setActiveNotification(med);
    if (med.audioNote) {
      setTimeout(() => {
        if (audioRef.current) {
          audioRef.current.src = med.audioNote;
          audioRef.current.play().catch(e => console.log("Auto-play blocked", e));
        }
      }, 500);
    }
  };

  const closeNotification = () => {
    setActiveNotification(null);
  };

  const renderContent = () => {
    switch (view) {
      case ViewMode.DOCTOR:
        return <DoctorDashboard onBack={() => setView(ViewMode.SELECTION)} />;
      case ViewMode.PATIENT:
        return (
          <PatientDashboard
            onBack={() => setView(ViewMode.SELECTION)}
            onShowDetail={triggerNotification}
          />
        );
      case ViewMode.SELECTION:
      default:
        // Default Landing Page: User Role Selection
        // 預設首頁：使用者角色選擇
        return (
          <div className="min-h-screen bg-gradient-to-br from-teal-50 to-orange-50 flex items-center justify-center p-4">
            <div className="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden">
              <div className="p-8 text-center">
                <div className="w-20 h-20 bg-teal-100 rounded-full flex items-center justify-center mx-auto mb-6 text-4xl">
                  💊
                </div>
                <h1 className="text-3xl font-bold text-gray-800 mb-2">MediCare Connect</h1>
                <p className="text-gray-500 mb-8">智慧用藥提醒與 AI 辨識助手</p>

                <div className="space-y-4">
                  <button
                    onClick={() => setView(ViewMode.PATIENT)}
                    className="w-full group relative flex items-center justify-between p-4 bg-orange-500 hover:bg-orange-600 rounded-xl transition-all shadow-md hover:shadow-lg"
                  >
                    <div className="flex items-center gap-4">
                      <span className="text-3xl bg-white/20 p-2 rounded-lg">👵</span>
                      <div className="text-left">
                        <div className="text-white font-bold text-xl">我是病人/長輩</div>
                        <div className="text-orange-100 text-sm">查看提醒、吃藥確認</div>
                      </div>
                    </div>
                    <span className="text-white text-2xl group-hover:translate-x-1 transition">→</span>
                  </button>

                  <button
                    onClick={() => setView(ViewMode.DOCTOR)}
                    className="w-full group relative flex items-center justify-between p-4 bg-teal-600 hover:bg-teal-700 rounded-xl transition-all shadow-md hover:shadow-lg"
                  >
                    <div className="flex items-center gap-4">
                      <span className="text-3xl bg-white/20 p-2 rounded-lg">👨‍⚕️</span>
                      <div className="text-left">
                        <div className="text-white font-bold text-xl">我是醫師/家屬</div>
                        <div className="text-teal-100 text-sm">設定藥物、錄製叮嚀</div>
                      </div>
                    </div>
                    <span className="text-white text-2xl group-hover:translate-x-1 transition">→</span>
                  </button>
                </div>
              </div>
              <div className="bg-gray-50 p-4 text-center">
                <div className="text-xs text-gray-400 mb-2">
                  Designed for ease of use and safety. Powered by Gemini AI.
                </div>
                <div className="text-xs text-teal-600 border-t pt-2 border-gray-200">
                  💡 提示：在瀏覽器選單點擊「加入主畫面」，即可像 App 一樣安裝到手機。
                </div>
              </div>
            </div>
          </div>
        );
    }
  };

  return (
    <>
      {renderContent()}

      <audio ref={audioRef} className="hidden" />

      {/* Global Notification Modal (Runs on TOP of everything) */}
      {activeNotification && (
        <div className="fixed inset-0 z-[100] bg-black/90 flex flex-col items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl animate-fade-in-up">
            <div className="bg-red-500 p-6 text-center text-white relative">
              <h2 className="text-3xl font-bold mb-2">該吃藥了！</h2>
              <p className="text-xl opacity-90">{activeNotification.time}</p>
              <button onClick={closeNotification} className="absolute top-4 right-4 bg-red-700/50 hover:bg-red-700 p-2 rounded-full text-white">✕</button>
            </div>

            <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
              {activeNotification.audioNote && (
                <button onClick={() => { if (audioRef.current) { audioRef.current.currentTime = 0; audioRef.current.play(); } }} className="w-full bg-yellow-100 text-yellow-800 p-3 rounded-xl font-bold flex items-center justify-center gap-2 mb-4">
                  🔊 播放家屬叮嚀
                </button>
              )}

              {(activeNotification.subItems || [{
                id: activeNotification.id,
                name: activeNotification.name!,
                dosage: activeNotification.dosage!,
                referenceImage: activeNotification.referenceImage!,
                nhiCode: ''
              }]).map((item, idx) => (
                <div key={idx} className="border-b pb-4 last:border-0">
                  <div className="flex gap-4 mb-2">
                    <img
                      src={item.referenceImage}
                      alt=""
                      referrerPolicy="no-referrer"
                      className="w-24 h-24 object-cover rounded-xl bg-gray-100 border-2 border-gray-200"
                      onError={(e) => e.currentTarget.src = "https://cdn-icons-png.flaticon.com/512/2966/2966334.png"}
                    />
                    <div>
                      <h3 className="text-xl font-bold text-gray-800">{item.name}</h3>
                      <div className="text-lg bg-blue-100 text-blue-800 px-3 py-1 rounded-full inline-block mt-1 font-bold">{item.dosage}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-4 bg-gray-50 border-t">
              <button onClick={closeNotification} className="w-full bg-green-600 text-white py-4 rounded-xl text-2xl font-bold hover:bg-green-700 shadow-lg">
                完成吃藥 🎉
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default App;
