import React, { useState, useEffect } from 'react';
import { Medication, MedicationItem } from '../types';
import { saveMedication, compressImage } from '../services/storageService';

import AudioRecorder from './AudioRecorder';

interface Props {
  initialData?: Medication; // Optional data for editing mode / 編輯模式的初始資料
  onCancel: () => void;
  onSuccess: () => void;
}

const DEFAULT_IMAGE = "https://cdn-icons-png.flaticon.com/512/2966/2966334.png";

const MedicationForm: React.FC<Props> = ({ initialData, onCancel, onSuccess }) => {
  // Form State for the "Time Slot"
  const [time, setTime] = useState(initialData?.time || '09:00');
  const [type, setType] = useState<'medicine' | 'supplement'>(initialData?.type || 'medicine');
  const [audioData, setAudioData] = useState<string | null>(initialData?.audioNote || null);

  // Form State for the "List of Pills"
  const [subItems, setSubItems] = useState<MedicationItem[]>([]);

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Effect: Sync state when initialData changes (Fixes "Edit" button issue)
  // Effect: 當 initialData 改變時同步狀態 (修正「編輯」按鈕沒反應的問題)
  useEffect(() => {
    if (initialData) {
      setTime(initialData.time);
      setType(initialData.type);
      setAudioData(initialData.audioNote);

      if (initialData.subItems) {
        setSubItems(initialData.subItems);
      } else if (initialData.name) {
        // Legacy data conversion
        setSubItems([{
          id: Date.now().toString(),
          name: initialData.name,
          dosage: initialData.dosage || '',
          referenceImage: initialData.referenceImage || DEFAULT_IMAGE,
          nhiCode: ''
        }]);
      }
    } else {
      // Reset if switching to "Add New"
      // 若切換到「新增」模式則重置
      setTime('09:00');
      setType('medicine');
      setAudioData(null);
      setSubItems([{
        id: Date.now().toString(),
        name: '',
        dosage: '',
        referenceImage: DEFAULT_IMAGE,
        nhiCode: ''
      }]);
    }
  }, [initialData]);

  // Initial load fallback (for first render)
  useEffect(() => {
    if (subItems.length === 0 && !initialData) {
      setSubItems([{
        id: Date.now().toString(),
        name: '',
        dosage: '',
        referenceImage: DEFAULT_IMAGE,
        nhiCode: ''
      }]);
    }
  }, []);

  const handleAddSubItem = () => {
    setSubItems([...subItems, {
      id: Date.now().toString(),
      name: '',
      dosage: '',
      referenceImage: DEFAULT_IMAGE,
      nhiCode: ''
    }]);
  };

  const handleRemoveSubItem = (id: string) => {
    setSubItems(subItems.filter(i => i.id !== id));
  };

  const handleUpdateSubItem = (id: string, field: keyof MedicationItem, value: string) => {
    setSubItems(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  const handleImageUpload = async (id: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const rawBase64 = reader.result as string;
        const compressed = await compressImage(rawBase64);
        handleUpdateSubItem(id, 'referenceImage', compressed);
      };
      reader.readAsDataURL(file);
    }
  };

  const openGoogleSearch = (name: string, nhiCode?: string) => {
    const query = (nhiCode && nhiCode.length > 5) ? nhiCode : name;
    if (!query) {
      alert("請先輸入藥名");
      return;
    }
    const url = `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(query + ' 藥物外觀')}`;
    window.open(url, '_blank');
  };

  const handleSave = () => {
    // 允許保存沒有藥品的提醒 (例如僅用於通知)
    if (subItems.length > 0 && subItems.some(i => !i.name.trim())) {
      alert("請輸入藥物名稱");
      return;
    }

    setIsSubmitting(true);

    // Construct the Medication object
    const newMedication: Medication = {
      id: initialData?.id || Date.now().toString(),
      time,
      type,
      audioNote: audioData || '',
      subItems: subItems,
      // Legacy fields for backward compatibility
      name: subItems.length > 0 ? subItems.map(i => i.name).join(', ') : '提醒',
      dosage: subItems.length > 0 ? subItems.map(i => i.dosage).join(', ') : '',
      referenceImage: subItems.length > 0 ? subItems[0].referenceImage : DEFAULT_IMAGE,
      createdAt: initialData?.createdAt || Date.now()
    };

    saveMedication(newMedication);
    setIsSubmitting(false);
    onSuccess();
  };

  return (
    <div className="bg-white p-6 rounded-2xl shadow-xl w-full max-w-lg h-full flex flex-col">
      <h2 className="text-2xl font-bold mb-6 text-gray-800 text-center">
        {initialData ? '編輯提醒' : '新增提醒'}
      </h2>

      <div className="flex-1 overflow-y-auto space-y-6 pr-2">
        {/* 1. Time Selection */}
        <div className="space-y-2">
          <label className="block text-sm font-bold text-gray-700">⏰ 提醒時間</label>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="w-full text-4xl font-black p-4 bg-gray-100 rounded-xl text-center focus:ring-4 focus:ring-teal-200 outline-none text-teal-800"
          />
        </div>

        {/* 2. Medication List */}
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <label className="block text-sm font-bold text-gray-700">💊 藥物清單 ({subItems.length})</label>
            <button type="button" onClick={handleAddSubItem} className="bg-teal-100 text-teal-700 px-3 py-1 rounded-full text-sm font-bold hover:bg-teal-200">
              + 增加藥物
            </button>
          </div>

          {subItems.map((item, index) => (
            <div key={item.id} className="border-2 border-dashed border-gray-200 rounded-xl p-4 relative group hover:border-teal-300 transition-colors">
              <button onClick={() => handleRemoveSubItem(item.id)} className="absolute top-2 right-2 text-gray-300 hover:text-red-500 font-bold px-2">
                ✕ 移除
              </button>

              <div className="flex gap-4">
                {/* Image Section */}
                <div className="flex flex-col gap-2 items-center w-28 flex-shrink-0">
                  <div className="w-24 h-24 bg-gray-100 rounded-lg overflow-hidden border relative">
                    <img
                      src={item.referenceImage}
                      alt="Medication"
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                      onError={(e) => e.currentTarget.src = DEFAULT_IMAGE}
                    />
                  </div>

                  {/* New Camera / Gallery Buttons */}
                  <div className="flex gap-1 w-full">
                    <label className="flex-1 bg-blue-100 hover:bg-blue-200 text-blue-700 text-[10px] py-2 rounded text-center cursor-pointer font-bold flex flex-col items-center justify-center">
                      <span>📷</span>
                      <span>拍照</span>
                      {/* capture="environment" forces rear camera on mobile */}
                      <input type="file" className="hidden" accept="image/*" capture="environment" onChange={(e) => handleImageUpload(item.id, e)} />
                    </label>
                    <label className="flex-1 bg-green-100 hover:bg-green-200 text-green-700 text-[10px] py-2 rounded text-center cursor-pointer font-bold flex flex-col items-center justify-center">
                      <span>🖼️</span>
                      <span>相簿</span>
                      {/* Standard file input */}
                      <input type="file" className="hidden" accept="image/*" onChange={(e) => handleImageUpload(item.id, e)} />
                    </label>
                  </div>
                </div>

                {/* Text Fields */}
                <div className="flex-1 space-y-3 min-w-0">
                  <div>
                    <label className="text-xs text-gray-500">藥名</label>
                    <input
                      type="text"
                      className="w-full font-bold text-lg border-b border-gray-200 focus:border-teal-500 outline-none p-1"
                      placeholder="例如: 降血壓藥"
                      value={item.name}
                      onChange={(e) => handleUpdateSubItem(item.id, 'name', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">劑量</label>
                    <input
                      type="text"
                      className="w-full text-gray-700 border-b border-gray-200 focus:border-teal-500 outline-none p-1"
                      placeholder="例如: 1顆"
                      value={item.dosage}
                      onChange={(e) => handleUpdateSubItem(item.id, 'dosage', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">健保代碼 (選填)</label>
                    <input
                      type="text"
                      className="w-full text-gray-700 border-b border-gray-200 focus:border-teal-500 outline-none p-1 tracking-wider uppercase"
                      placeholder="AA..."
                      value={item.nhiCode || ''}
                      onChange={(e) => handleUpdateSubItem(item.id, 'nhiCode', e.target.value)}
                    />
                  </div>

                  {/* Image Search Tools */}
                  <div className="flex gap-2 justify-end pt-1">
                    <button
                      onClick={() => openGoogleSearch(item.name, item.nhiCode)}
                      className="bg-blue-50 text-blue-600 px-2 py-1 rounded text-xs font-bold hover:bg-blue-100 flex items-center gap-1"
                    >
                      🔍 找圖片 (Google)
                    </button>
                  </div>
                </div>
              </div>

              {/* Paste URL Input */}
              <div className="mt-2 pt-2 border-t border-dashed border-gray-100">
                <input
                  type="text"
                  placeholder="或是直接貼上圖片網址..."
                  className="w-full text-xs bg-gray-50 border border-gray-200 rounded p-2 text-gray-600 focus:ring-1 focus:ring-teal-200 outline-none"
                  value={item.referenceImage.startsWith('data:') ? '' : item.referenceImage}
                  onChange={(e) => handleUpdateSubItem(item.id, 'referenceImage', e.target.value)}
                />
                <div className="text-[10px] text-gray-400 mt-1">
                  * 點擊搜尋後，可長按網站圖片選「複製圖片網址」或下載後上傳。
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* 3. Audio Note */}
        <div className="space-y-2 pt-4 border-t">
          <AudioRecorder onRecordingComplete={setAudioData} />
          {audioData && (
            <div className="text-center text-xs text-green-600 font-medium">
              ✅ 已儲存錄音
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-3 mt-6 pt-4 border-t">
        <button
          onClick={onCancel}
          className="flex-1 py-3 px-4 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition"
        >
          取消
        </button>
        <button
          onClick={handleSave}
          disabled={isSubmitting}
          className="flex-1 py-3 px-4 bg-teal-600 text-white font-bold rounded-xl hover:bg-teal-700 transition shadow-lg disabled:opacity-50"
        >
          {isSubmitting ? '儲存中...' : '確認儲存'}
        </button>
      </div>
    </div>
  );
};

export default MedicationForm;
