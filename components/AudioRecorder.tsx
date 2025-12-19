import React, { useState, useRef, useEffect } from 'react';

interface AudioRecorderProps {
  onRecordingComplete: (base64Audio: string) => void;
}

const AudioRecorder: React.FC<AudioRecorderProps> = ({ onRecordingComplete }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [timeLeft, setTimeLeft] = useState(15);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  
  // Refs to hold objects that persist between renders without causing re-renders.
  // 使用 Ref 來保存不需要觸發重新渲染的物件 (如錄音實例、音訊資料片段)。
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  // Effect: Handle the countdown timer logic.
  // Effect: 處理倒數計時邏輯。
  useEffect(() => {
    if (isRecording) {
      timerRef.current = window.setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            stopRecording(); // Auto-stop when time is up / 時間到自動停止
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      // Reset timer when not recording
      // 停止錄音時重置計時器
      if (timerRef.current) window.clearInterval(timerRef.current);
      setTimeLeft(15);
    }
    // Cleanup function
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [isRecording]);

  const startRecording = async () => {
    try {
      // Request microphone access.
      // 請求麥克風權限。
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      chunksRef.current = [];

      // Collect audio data chunks as they become available.
      // 當有音訊資料產生時，將其收集起來。
      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      // When recording stops, process the final audio file.
      // 當錄音停止時，處理最終的音訊檔案。
      mediaRecorderRef.current.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        setAudioUrl(url); // For playback / 用於播放預覽
        
        // Convert Blob to Base64 string for storage.
        // 將 Blob 轉換為 Base64 字串以便儲存。
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onloadend = () => {
          const base64 = reader.result as string;
          onRecordingComplete(base64);
        };

        // Stop all tracks to release the microphone hardware.
        // 停止所有軌道以釋放麥克風硬體資源。
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
      setTimeLeft(15);
    } catch (err) {
      console.error("Error accessing microphone:", err);
      alert("無法存取麥克風");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  return (
    <div className="flex flex-col items-center space-y-2 p-4 border rounded-lg bg-gray-50">
      <div className="flex justify-between w-full">
        <div className="text-sm font-semibold text-gray-700">家屬叮嚀錄音 (最多 15 秒)</div>
        {isRecording && <div className="text-sm font-bold text-red-600 animate-pulse">{timeLeft}s</div>}
      </div>
      
      <div className="flex gap-4">
        {!isRecording ? (
          <button
            type="button"
            onClick={startRecording}
            className="flex items-center gap-2 px-4 py-2 bg-red-100 text-red-600 rounded-full hover:bg-red-200 transition"
          >
            <span className="w-3 h-3 bg-red-600 rounded-full"></span>
            {audioUrl ? '重新錄音' : '開始錄音'}
          </button>
        ) : (
          <button
            type="button"
            onClick={stopRecording}
            className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-white rounded-full hover:bg-black transition"
          >
            <span className="w-3 h-3 bg-white rounded-sm"></span>
            停止錄音
          </button>
        )}
      </div>
      
      {/* Preview Audio Player */}
      {audioUrl && !isRecording && (
        <audio controls src={audioUrl} className="w-full mt-2 h-10" />
      )}
    </div>
  );
};

export default AudioRecorder;
