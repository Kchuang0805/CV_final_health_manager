
import React, { useState, useEffect, useRef } from 'react';
import { Medication, PrescriptionItem, MedicationItem } from '../types';
import { getMedications, importConfig, importShareCode, compressImage, saveMedication } from '../services/storageService';
import { scanPrescription, scanMedicineBag } from '../services/geminiService';
import MedicationForm from './MedicationForm';

interface Props {
  onBack: () => void;
  onShowDetail: (med: Medication) => void;
}

const PatientDashboard: React.FC<Props> = ({ onBack, onShowDetail }) => {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [medications, setMedications] = useState<Medication[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showImportCode, setShowImportCode] = useState(false);
  const [inputCode, setInputCode] = useState("");

  // --- Scanning States (Ported from DoctorDashboard) ---
  const [isScanning, setIsScanning] = useState(false);
  const [scanningMessage, setScanningMessage] = useState("");
  const [scannedItems, setScannedItems] = useState<{ item: PrescriptionItem, id: string, time: string }[]>([]);
  const [showScanReview, setShowScanReview] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const scanInputRef = useRef<HTMLInputElement>(null);
  const bagScanInputRef = useRef<HTMLInputElement>(null);

  const refreshMedications = () => {
    setMedications(getMedications());
  };

  useEffect(() => {
    refreshMedications();
  }, []);

  // Timer for clock display
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        if (importConfig(content)) {
          refreshMedications();
          alert("匯入成功！");
        } else {
          alert("匯入失敗：檔案格式錯誤");
        }
      };
      reader.readAsText(file);
    }
  };

  const handlePasteCode = () => {
    if (!inputCode) return;
    const success = importShareCode(inputCode);
    if (success) {
      refreshMedications();
      setShowImportCode(false);
      setInputCode("");
      alert("設定同步成功！");
    } else {
      alert("代碼格式錯誤");
    }
  };

  // --- Scanning Logic Start ---

  const handleScanClick = () => {
    scanInputRef.current?.click();
  };

  const handleScanFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        setIsScanning(true);
        setScanningMessage("AI 正在辨識處方箋...");
        const reader = new FileReader();
        reader.onloadend = async () => {
          const rawBase64 = reader.result as string;
          const compressed = await compressImage(rawBase64, 800);
          const results = await scanPrescription(compressed);

          if (results.length === 0) {
            alert("未能辨識出藥物，請確保照片清晰。");
            setIsScanning(false);
            return;
          }

          const flatItems: { item: PrescriptionItem, id: string, time: string }[] = [];
          results.forEach((item, index) => {
            item.suggestedTimes.forEach((time, tIndex) => {
              flatItems.push({
                item: item,
                id: `${Date.now()}-${index}-${tIndex}`,
                time: time
              });
            });
          });

          setScannedItems(flatItems);
          setShowScanReview(true);
          setIsScanning(false);
        };
        reader.readAsDataURL(file);
      } catch (err) {
        console.error(err);
        alert("掃描失敗，請檢查網路連線或重試。");
        setIsScanning(false);
      }
    }
  };

  const handleBagScanClick = () => {
    bagScanInputRef.current?.click();
  };

  const handleBagScanFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsScanning(true);
    setScanningMessage(`正在分析 ${files.length} 張藥袋以校正時間...`);

    let updatedItems = [...scannedItems];
    let matchCount = 0;

    try {
      const promises = Array.from(files as FileList).map((file: File) => {
        return new Promise<{ name: string; times: string[] } | null>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = async () => {
            const compressed = await compressImage(reader.result as string, 800);
            const result = await scanMedicineBag(compressed);
            resolve(result);
          };
          reader.readAsDataURL(file);
        });
      });

      const bagResults = await Promise.all(promises);

      bagResults.forEach((bag) => {
        if (!bag || !bag.name || bag.times.length === 0) return;

        const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]/g, "");
        const bagNameNorm = normalize(bag.name);

        const matchedIndices = updatedItems.reduce((acc, curr, idx) => {
          const itemNameNorm = normalize(curr.item.name);
          const itemCodeNorm = curr.item.nhiCode ? normalize(curr.item.nhiCode) : "";

          if (itemNameNorm.includes(bagNameNorm) || bagNameNorm.includes(itemNameNorm) || (itemCodeNorm && bagNameNorm.includes(itemCodeNorm))) {
            acc.push(idx);
          }
          return acc;
        }, [] as number[]);

        if (matchedIndices.length > 0) {
          matchCount++;
          const baseItem = updatedItems[matchedIndices[0]].item;
          updatedItems = updatedItems.filter((_, idx) => !matchedIndices.includes(idx));
          bag.times.forEach((time, tIdx) => {
            updatedItems.push({
              item: baseItem,
              id: `${Date.now()}-${matchCount}-${tIdx}-bag`,
              time: time
            });
          });
        }
      });

      setScannedItems(updatedItems);
      alert(`已分析藥袋並校正了 ${matchCount} 項藥物的服用時間！`);

    } catch (e) {
      console.error(e);
      alert("藥袋掃描部分失敗，請手動檢查結果。");
    } finally {
      setIsScanning(false);
      if (bagScanInputRef.current) bagScanInputRef.current.value = '';
    }
  };

  const handleScannedItemImageUpload = async (id: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const rawBase64 = reader.result as string;
        const compressed = await compressImage(rawBase64);
        handleUpdateScannedItem(id, 'imageUrl', compressed);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUpdateScannedItem = (id: string, field: 'time' | 'name' | 'dosage' | 'imageUrl', value: string) => {
    setScannedItems(prev => prev.map(p => {
      if (p.id === id) {
        if (field === 'time') return { ...p, time: value };
        if (field === 'name') return { ...p, item: { ...p.item, name: value } };
        if (field === 'dosage') return { ...p, item: { ...p.item, dosage: value } };
        if (field === 'imageUrl') return { ...p, item: { ...p.item, imageUrl: value } };
      }
      return p;
    }));
  };

  const handleRemoveScannedItem = (id: string) => {
    setScannedItems(prev => prev.filter(p => p.id !== id));
  };

  const openGoogleSearch = (name: string, nhiCode?: string) => {
    const query = name || nhiCode || "";
    if (!query) {
      alert("請先輸入名稱或健保碼");
      return;
    }
    const url = `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(query + ' 藥物外觀')}`;
    window.open(url, '_blank');
  };

  const handleConfirmImport = () => {
    const groupedData: Record<string, { item: PrescriptionItem, id: string }[]> = {};
    scannedItems.forEach(p => {
      if (!groupedData[p.time]) {
        groupedData[p.time] = [];
      }
      groupedData[p.time].push(p);
    });

    const DEFAULT_IMAGE = "https://cdn-icons-png.flaticon.com/512/2966/2966334.png";

    Object.keys(groupedData).forEach(time => {
      const items = groupedData[time];
      const subItems: MedicationItem[] = items.map(p => ({
        id: p.id,
        name: p.item.name,
        dosage: p.item.dosage,
        referenceImage: p.item.imageUrl || DEFAULT_IMAGE,
        nhiCode: p.item.nhiCode
      }));

      const newMed: Medication = {
        id: Date.now().toString() + Math.random().toString().slice(2, 6),
        time: time,
        type: 'medicine',
        audioNote: '',
        subItems: subItems,
        name: subItems.map(i => i.name).join(', '),
        dosage: subItems.map(i => i.dosage).join(', '),
        referenceImage: subItems[0].referenceImage,
        createdAt: Date.now()
      };

      saveMedication(newMed);
    });

    refreshMedications();
    setShowScanReview(false);
    setScannedItems([]);
    alert(`成功匯入！已根據時間自動合併成 ${Object.keys(groupedData).length} 個提醒。`);
  };

  // --- Scanning Logic End ---

  return (
    <div className="min-h-screen bg-orange-50 flex flex-col relative">
      <header className="bg-orange-600 text-white p-6 shadow-lg flex justify-between items-center sticky top-0 z-10">
        <div>
          <h1 className="text-3xl font-bold">早安/晚安</h1>
          <p className="text-lg opacity-90">今天是 {currentTime.toLocaleDateString()}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowImportCode(true)} className="bg-orange-700 hover:bg-orange-800 p-2 rounded text-sm flex flex-col items-center">
            <span>📲</span><span className="text-xs">分享碼</span>
          </button>
          <button onClick={handleImportClick} className="bg-orange-700 hover:bg-orange-800 p-2 rounded text-sm flex flex-col items-center">
            <span>📂</span><span className="text-xs">匯入</span>
          </button>
          <input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={handleFileChange} />
          <button onClick={onBack} className="bg-orange-700 hover:bg-orange-800 p-2 rounded text-sm flex flex-col items-center">
            <span>🏠</span><span className="text-xs">首頁</span>
          </button>
        </div>
      </header>

      {/* Loading Overlay */}
      {isScanning && (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center">
          <div className="bg-white p-6 rounded-2xl flex flex-col items-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-orange-600 mb-4"></div>
            <p className="text-lg font-bold text-gray-800">AI 運算中...</p>
            <p className="text-sm text-gray-500">{scanningMessage || "正在分析影像"}</p>
          </div>
        </div>
      )}

      <main className="flex-1 p-6 pb-24">
        <div className="text-center mb-8">
          <div className="text-6xl font-black text-gray-800 tracking-wider">
            {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
          <p className="text-xl text-gray-600 mt-2">下一餐藥物時間將會自動提醒您</p>
        </div>

        <div className="max-w-md mx-auto space-y-4">
          <div className="flex flex-col gap-2 border-b pb-4 border-orange-200 mb-4">
            <h2 className="text-2xl font-bold text-gray-800">今日行程</h2>

            {/* Action Buttons Row */}
            <div className="flex gap-2">
              <button onClick={() => setShowAddForm(true)} className="flex-1 bg-teal-600 text-white py-3 rounded-xl font-bold shadow hover:bg-teal-700 transition flex items-center justify-center gap-1">
                <span className="text-xl">+</span> 手動新增
              </button>
              <button onClick={handleScanClick} className="flex-1 bg-blue-500 text-white py-3 rounded-xl font-bold shadow hover:bg-blue-600 transition flex items-center justify-center gap-1">
                <span className="text-xl">📷</span> 掃描藥單
              </button>
              <button onClick={handleBagScanClick} className="flex-1 bg-indigo-500 text-white py-3 rounded-xl font-bold shadow hover:bg-indigo-600 transition flex items-center justify-center gap-1 text-sm">
                <span className="text-xl">💊</span> 掃藥袋
              </button>
              <input type="file" ref={scanInputRef} className="hidden" accept="image/*" capture="environment" onChange={handleScanFileChange} />
              <input type="file" ref={bagScanInputRef} className="hidden" accept="image/*" multiple onChange={handleBagScanFileChange} />
            </div>
          </div>

          {medications.sort((a, b) => a.time.localeCompare(b.time)).map(med => {
            const items = med.subItems || [{
              id: med.id,
              name: med.name || '',
              dosage: med.dosage || '',
              referenceImage: med.referenceImage || '',
              nhiCode: ''
            }];

            return (
              <div key={med.id} onClick={() => onShowDetail(med)} className="bg-white rounded-2xl p-4 shadow-md flex items-start gap-4 cursor-pointer hover:bg-orange-100 transition border-l-8 border-orange-400">
                <div className="text-2xl font-bold text-orange-600 w-16 pt-1">{med.time}</div>
                <div className="flex-1 space-y-2">
                  {items.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-3 bg-gray-50 p-2 rounded-lg">
                      <img
                        src={item.referenceImage}
                        className="w-12 h-12 rounded bg-white object-cover border"
                        referrerPolicy="no-referrer"
                        onError={(e) => e.currentTarget.src = "https://cdn-icons-png.flaticon.com/512/2966/2966334.png"}
                        alt=""
                      />
                      <div>
                        <div className="font-bold text-gray-800">{item.name}</div>
                        <div className="text-sm text-gray-500">{item.dosage}</div>
                      </div>
                    </div>
                  ))}
                  <div className="text-xs text-gray-400 text-right">共 {items.length} 種藥物</div>
                </div>
              </div>
            );
          })}
          {medications.length === 0 && (
            <div className="text-center text-gray-500 text-xl py-10 bg-white rounded-xl">目前沒有設定任何藥物。</div>
          )}
        </div>
      </main>

      {/* Import Code Modal */}
      {showImportCode && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl animate-fade-in-up">
            <h3 className="text-xl font-bold text-gray-900 mb-4">輸入家屬分享碼</h3>
            <textarea className="w-full h-32 p-3 bg-gray-100 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 mb-4" placeholder="請貼上代碼..." value={inputCode} onChange={(e) => setInputCode(e.target.value)} />
            <div className="flex gap-3">
              <button onClick={() => setShowImportCode(false)} className="flex-1 py-3 px-4 bg-gray-200 text-gray-700 font-bold rounded-xl hover:bg-gray-300">取消</button>
              <button onClick={handlePasteCode} className="flex-1 py-3 px-4 bg-orange-600 text-white font-bold rounded-xl hover:bg-orange-700">確認</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Form (Manual) */}
      {showAddForm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full max-w-lg h-[90vh] sm:h-auto overflow-y-auto rounded-t-3xl sm:rounded-2xl shadow-2xl animate-fade-in-up">
            <MedicationForm onCancel={() => setShowAddForm(false)} onSuccess={() => { setShowAddForm(false); refreshMedications(); }} />
          </div>
        </div>
      )}

      {/* Scan Review Modal (Reused from DoctorDashboard style but with Orange accents) */}
      {showScanReview && (
        <div className="fixed inset-0 z-[80] bg-black/80 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg h-[85vh] flex flex-col shadow-2xl animate-fade-in-up">
            <div className="p-4 border-b bg-orange-50 rounded-t-2xl">
              <h3 className="text-xl font-bold text-gray-800">📋 確認掃描結果</h3>
              <p className="text-sm text-gray-600 mb-2">偵測到 {scannedItems.length} 個用藥提醒。</p>

              <button
                onClick={handleBagScanClick}
                className="w-full bg-indigo-500 hover:bg-indigo-600 text-white py-2 px-4 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition shadow"
              >
                <span>📷</span>
                批量掃描藥袋 (校正吃法)
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {scannedItems.map((entry) => (
                <div key={entry.id} className="border rounded-xl p-3 bg-white shadow-sm flex flex-col gap-2">
                  <div className="flex gap-2">
                    <div className="w-24 flex flex-col gap-1 flex-shrink-0 items-center">
                      <div className="w-20 h-20 bg-gray-100 rounded-lg border overflow-hidden">
                        {entry.item.imageUrl ? (
                          <img
                            src={entry.item.imageUrl}
                            onError={(e) => e.currentTarget.src = "https://cdn-icons-png.flaticon.com/512/2966/2966334.png"}
                            alt="AI Found"
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs text-center p-1">無圖片</div>
                        )}
                      </div>

                      <div className="flex gap-1 w-full justify-center">
                        <label className="cursor-pointer bg-blue-100 p-1.5 rounded text-[10px] hover:bg-blue-200" title="拍照">
                          📷
                          <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handleScannedItemImageUpload(entry.id, e)} />
                        </label>
                        <label className="cursor-pointer bg-green-100 p-1.5 rounded text-[10px] hover:bg-green-200" title="相簿">
                          🖼️
                          <input type="file" accept="image/*" className="hidden" onChange={(e) => handleScannedItemImageUpload(entry.id, e)} />
                        </label>
                      </div>

                      <input
                        type="text"
                        placeholder="或貼網址..."
                        className="text-[10px] border rounded p-1 w-full bg-gray-50 text-gray-600 outline-none focus:ring-1 focus:ring-orange-300 mt-1"
                        value={entry.item.imageUrl || ''}
                        onChange={(e) => handleUpdateScannedItem(entry.id, 'imageUrl', e.target.value)}
                      />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <label className="text-xs text-gray-500">藥名 {entry.item.nhiCode && <span className="text-blue-500">({entry.item.nhiCode})</span>}</label>
                          <div className="flex gap-2 items-center">
                            <input
                              type="text"
                              value={entry.item.name}
                              onChange={(e) => handleUpdateScannedItem(entry.id, 'name', e.target.value)}
                              className="w-full font-bold text-gray-800 border-b border-gray-200 focus:border-orange-500 outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => openGoogleSearch(entry.item.name, entry.item.nhiCode)}
                              className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600 hover:bg-gray-200 font-bold whitespace-nowrap"
                            >
                              🔍
                            </button>
                          </div>
                        </div>
                        <button onClick={() => handleRemoveScannedItem(entry.id)} className="text-gray-400 hover:text-red-500 px-2">✕</button>
                      </div>
                      <div className="flex gap-2 mt-2">
                        <div className="flex-1">
                          <label className="text-xs text-gray-500">劑量</label>
                          <input type="text" value={entry.item.dosage} onChange={(e) => handleUpdateScannedItem(entry.id, 'dosage', e.target.value)} className="w-full text-sm text-gray-700 border-b border-gray-200 focus:border-orange-500 outline-none" />
                        </div>
                        <div className="flex-1">
                          <label className="text-xs text-gray-500 font-bold text-orange-600">提醒時間</label>
                          <input type="time" value={entry.time} onChange={(e) => handleUpdateScannedItem(entry.id, 'time', e.target.value)} className="w-full text-lg font-bold bg-orange-50 rounded px-2 text-orange-800 outline-none focus:ring-2 focus:ring-orange-300" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-4 border-t flex gap-3 bg-gray-50 rounded-b-2xl">
              <button onClick={() => { setShowScanReview(false); setScannedItems([]); }} className="flex-1 py-3 bg-gray-200 text-gray-700 font-bold rounded-xl hover:bg-gray-300 transition">放棄</button>
              <button onClick={handleConfirmImport} disabled={scannedItems.length === 0} className="flex-1 py-3 bg-orange-600 text-white font-bold rounded-xl hover:bg-orange-700 transition shadow disabled:opacity-50">合併並匯入</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PatientDashboard;
