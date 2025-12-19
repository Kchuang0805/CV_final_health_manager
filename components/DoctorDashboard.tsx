
import React, { useState, useEffect, useRef } from 'react';
import { Medication, PrescriptionItem, MedicationItem } from '../types';
import { getMedications, deleteMedication, saveMedication, exportConfig, importConfig, generateShareCode, compressImage, getPatients, getCurrentPatientId, setCurrentPatientId } from '../services/storageService';
import { scanPrescription, scanMedicineBag } from '../services/geminiService';
import { sendLineNotification } from '../services/lineService';
import MedicationForm from './MedicationForm';
import PatientSelector from './PatientSelector';

interface Props {
  onBack: () => void;
}

const DoctorDashboard: React.FC<Props> = ({ onBack }) => {
  const [medications, setMedications] = useState<Medication[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingMed, setEditingMed] = useState<Medication | undefined>(undefined);
  const [currentPatientId, setCurrentPatientIdState] = useState<string | null>(() => getCurrentPatientId());

  // Modal states
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [shareCode, setShareCode] = useState<string | null>(null);
  const [isSendingLine, setIsSendingLine] = useState(false);

  // Scanning States
  const [isScanning, setIsScanning] = useState(false);
  const [scanningMessage, setScanningMessage] = useState("");

  // We store scanned items as a Flat list initially to allow editing times, but visualized as groups
  const [scannedItems, setScannedItems] = useState<{ item: PrescriptionItem, id: string, time: string }[]>([]);
  const [showScanReview, setShowScanReview] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const scanInputRef = useRef<HTMLInputElement>(null);
  const bagScanInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMedications(getMedications(currentPatientId || undefined));
  }, [currentPatientId]);

  const handleSaveSuccess = () => {
    setMedications(getMedications(currentPatientId || undefined));
    setShowAddForm(false);
    setEditingMed(undefined);
  };

  const handleEdit = (med: Medication) => {
    setEditingMed(med);
    setShowAddForm(true);
  };

  const handleAddNew = () => {
    setEditingMed(undefined);
    setShowAddForm(true);
  };

  const onRequestDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent opening edit mode
    setDeletingId(id);
  };

  const confirmDelete = () => {
    if (!deletingId) return;
    try {
      deleteMedication(deletingId, currentPatientId || undefined);
      setMedications(prev => prev.filter(m => String(m.id) !== String(deletingId)));
      setDeletingId(null);
    } catch (err) {
      console.error("Delete UI Error:", err);
    }
  };

  const handleExport = () => {
    const url = exportConfig(currentPatientId || undefined);
    const a = document.createElement('a');
    a.href = url;
    a.download = `medicare-config-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        if (importConfig(content, currentPatientId || undefined)) {
          setMedications(getMedications(currentPatientId || undefined));
        } else {
          console.error("匯入失敗");
        }
      };
      reader.readAsText(file);
    }
  };

  const handleGenerateShareCode = () => {
    const code = generateShareCode();
    setShareCode(code);
  };

  const getSharePayload = () => {
    const baseUrl = window.location.origin + window.location.pathname;
    const importUrl = `${baseUrl}?import=${encodeURIComponent(shareCode || '')}`;
    const message = `💊 這是您的用藥提醒設定！\n\n請點擊下方連結，App 就會自動幫您設定好時間喔：\n${importUrl}`;
    return { importUrl, message };
  };

  const shareToLine = () => {
    if (!shareCode) return;
    const { message } = getSharePayload();
    const lineUrl = `https://line.me/R/msg/text/?${encodeURIComponent(message)}`;
    window.open(lineUrl, '_blank');
  };

  const shareToLineBot = async () => {
    if (!currentPatientId) {
      alert('請先選擇患者');
      return;
    }

    setIsSendingLine(true);
    try {
      const patients = getPatients();
      const patient = patients.find(p => p.id === currentPatientId);

      if (!patient?.lineUserId) {
        alert('此患者未設定 LINE User ID，請先編輯患者資訊');
        return;
      }

      await sendLineNotification({ userId: patient.lineUserId, medicationData: medications });
      alert('已透過 LINE Bot 推送藥品資料給病人');
    } catch (err) {
      console.error(err);
      alert('推送失敗，請確認患者 LINE ID 與伺服器設定');
    } finally {
      setIsSendingLine(false);
    }
  };

  const handleLineUserIdChange = (value: string) => {
    // 此功能已由 PatientSelector 接管
    console.log('LINE ID 變更已由患者管理器接管');
  };

  const copyToClipboard = () => {
    if (shareCode) {
      navigator.clipboard.writeText(shareCode);
      alert("已複製分享碼！");
    }
  };

  // --- Scanning Logic (Prescription) ---

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
          // Only use compression if base64 is large
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

  // --- Batch Medicine Bag Scanning Logic ---

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
      // Process files sequentially or in parallel. Parallel is faster.
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

      // Apply Logic: Fuzzy Match and Merge
      bagResults.forEach((bag) => {
        if (!bag || !bag.name || bag.times.length === 0) return;

        // 1. Find if this bag matches any existing items in scannedItems.
        // We use simple normalization for fuzzy matching.
        const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]/g, "");
        const bagNameNorm = normalize(bag.name);

        // Find all items that look like this drug (checking both drug name and NHI code if exists)
        const matchedIndices = updatedItems.reduce((acc, curr, idx) => {
          const itemNameNorm = normalize(curr.item.name);
          const itemCodeNorm = curr.item.nhiCode ? normalize(curr.item.nhiCode) : "";

          // Check if Bag Name is contained in List Name OR List Name in Bag Name
          // Also check NHI code if the bag AI returned it (though bag AI currently only returns name)
          if (itemNameNorm.includes(bagNameNorm) || bagNameNorm.includes(itemNameNorm) || (itemCodeNorm && bagNameNorm.includes(itemCodeNorm))) {
            acc.push(idx);
          }
          return acc;
        }, [] as number[]);

        if (matchedIndices.length > 0) {
          matchCount++;
          // 2. Get the base item data from the first match
          const baseItem = updatedItems[matchedIndices[0]].item;

          // 3. Filter OUT all existing entries for this drug (we will replace them)
          updatedItems = updatedItems.filter((_, idx) => !matchedIndices.includes(idx));

          // 4. Create NEW entries based on the Bag's times
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
      // Reset input so same files can be selected again if needed
      if (bagScanInputRef.current) bagScanInputRef.current.value = '';
    }
  };


  // Handle manual image upload for a scanned item
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

  // Helper to open Google Image Search
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
    // Group items by Time
    const groupedData: Record<string, { item: PrescriptionItem, id: string }[]> = {};

    scannedItems.forEach(p => {
      if (!groupedData[p.time]) {
        groupedData[p.time] = [];
      }
      groupedData[p.time].push(p);
    });

    const DEFAULT_IMAGE = "https://cdn-icons-png.flaticon.com/512/2966/2966334.png";

    // Create Medication objects for each time slot
    Object.keys(groupedData).forEach(time => {
      const items = groupedData[time];

      const subItems: MedicationItem[] = items.map(p => ({
        id: p.id,
        name: p.item.name,
        dosage: p.item.dosage,
        // Use AI found image, or default
        referenceImage: p.item.imageUrl || DEFAULT_IMAGE,
        nhiCode: p.item.nhiCode
      }));

      const newMed: Medication = {
        id: Date.now().toString() + Math.random().toString().slice(2, 6),
        time: time,
        type: 'medicine',
        audioNote: '',
        subItems: subItems,
        // Legacy fields
        name: subItems.map(i => i.name).join(', '),
        dosage: subItems.map(i => i.dosage).join(', '),
        referenceImage: subItems[0].referenceImage,
        createdAt: Date.now()
      };

      saveMedication(newMed);
    });

    setMedications(getMedications());
    setShowScanReview(false);
    setScannedItems([]);
    alert(`成功匯入！已根據時間自動合併成 ${Object.keys(groupedData).length} 個提醒。\n\n請記得補上藥物圖片以便長輩辨識喔！`);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-teal-600 text-white p-4 sticky top-0 z-10 shadow-md">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-xl font-bold">家屬/醫師 設定後台</h1>
          <button onClick={onBack} className="text-sm bg-teal-800 hover:bg-teal-900 px-3 py-1 rounded transition">回首頁</button>
        </div>
        <div className="grid grid-cols-5 gap-2">
          <button onClick={handleExport} className="bg-teal-500 hover:bg-teal-400 text-white py-2 rounded text-xs font-bold flex flex-col items-center justify-center gap-1 transition">
            <span>💾</span> 備份
          </button>
          <button onClick={handleImportClick} className="bg-teal-500 hover:bg-teal-400 text-white py-2 rounded text-xs font-bold flex flex-col items-center justify-center gap-1 transition">
            <span>📂</span> 匯入
          </button>
          <button onClick={handleScanClick} className="bg-blue-500 hover:bg-blue-400 text-white py-2 rounded text-xs font-bold flex flex-col items-center justify-center gap-1 transition border border-blue-400 shadow">
            <span>📷</span> 掃描藥單
          </button>
          <button onClick={handleGenerateShareCode} className="bg-green-500 hover:bg-green-400 text-white py-2 rounded text-xs font-bold flex flex-col items-center justify-center gap-1 transition shadow-lg border border-green-400">
            <span>📤</span> 分享
          </button>
          <button onClick={shareToLineBot} disabled={isSendingLine || !currentPatientId} className="bg-[#06C755] hover:bg-[#05b34c] disabled:opacity-50 text-white py-2 rounded text-xs font-bold flex flex-col items-center justify-center gap-1 transition">
            <span>🤖</span> {isSendingLine ? '推送中...' : 'LINE 推送'}
          </button>
          <input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={handleFileChange} />
          <input type="file" ref={scanInputRef} className="hidden" accept="image/*" capture="environment" onChange={handleScanFileChange} />
          {/* Batch Bag Scan Input: Supports multiple files */}
          <input type="file" ref={bagScanInputRef} className="hidden" accept="image/*" multiple onChange={handleBagScanFileChange} />
        </div>
      </header>

      {/* Main Content: Three Column Layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Column: Patient Selector */}
        <div className="w-64 bg-white border-r border-gray-300 overflow-y-auto shadow-sm">
          <PatientSelector
            currentPatientId={currentPatientId}
            onPatientSelected={(patientId) => {
              setCurrentPatientIdState(patientId);
              setCurrentPatientId(patientId);
            }}
          />
        </div>

        {/* Middle Column: Medications */}
        <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
          {!currentPatientId ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-xl text-gray-500 font-semibold">👈 請先從左邊選擇一個患者</p>
            </div>
          ) : (
            <div className="max-w-2xl mx-auto space-y-4">

              {!showAddForm && (
                <button onClick={handleAddNew} className="w-full py-4 rounded-xl border-2 border-dashed border-teal-500 text-teal-600 font-bold hover:bg-teal-50 transition">
                  + 新增提醒 (可多種藥物)
                </button>
              )}

              {showAddForm && (
                <MedicationForm
                  initialData={editingMed}
                  onCancel={() => { setShowAddForm(false); setEditingMed(undefined); }}
                  onSuccess={handleSaveSuccess}
                />
              )}

              <section>
                <h2 className="text-xl font-bold mb-4 text-gray-800">目前設定的提醒 ({medications.length})</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {medications.sort((a, b) => a.time.localeCompare(b.time)).map(med => {
                    // Backward compatibility check
                    const subItems = med.subItems || [{
                      id: med.id,
                      name: med.name || 'Unknown',
                      dosage: med.dosage || '',
                      referenceImage: med.referenceImage || '',
                      nhiCode: ''
                    }];

                    return (
                      <div key={med.id} className="bg-white p-4 rounded-xl shadow border border-gray-100 relative group hover:shadow-md transition">
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-teal-600 font-black text-2xl">⏰ {med.time}</span>
                          <div className="flex gap-2">
                            <button onClick={() => handleEdit(med)} className="text-gray-400 hover:text-blue-500 p-1">✏️</button>
                            <button onClick={(e) => onRequestDelete(med.id, e)} className="text-gray-400 hover:text-red-500 p-1">🗑️</button>
                          </div>
                        </div>

                        <div className="space-y-2">
                          {subItems.map((item, idx) => (
                            <div key={idx} className="flex items-center gap-3 bg-gray-50 p-2 rounded-lg">
                              <img
                                src={item.referenceImage}
                                referrerPolicy="no-referrer"
                                className="w-10 h-10 rounded bg-white object-cover border"
                                alt=""
                                onError={(e) => e.currentTarget.src = "https://cdn-icons-png.flaticon.com/512/2966/2966334.png"}
                              />
                              <div className="flex-1 min-w-0">
                                <div className="font-bold text-gray-800 text-sm truncate">{item.name}</div>
                                <div className="text-xs text-gray-500">{item.dosage} {item.nhiCode && `(${item.nhiCode})`}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                        {med.audioNote && <p className="text-xs text-green-600 mt-2 text-right">🎵 有錄音叮嚀</p>}
                      </div>
                    );
                  })}
                  {medications.length === 0 && (
                    <p className="text-gray-500 col-span-full text-center py-8">目前沒有任何提醒資料。</p>
                  )}
                </div>
              </section>
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deletingId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl animate-fade-in-up">
            <h3 className="text-xl font-bold text-gray-900 mb-2">確定刪除？</h3>
            <p className="text-gray-600 mb-6">刪除後將無法復原此設定。</p>
            <div className="flex gap-3">
              <button onClick={() => setDeletingId(null)} className="flex-1 py-3 px-4 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition">取消</button>
              <button onClick={confirmDelete} className="flex-1 py-3 px-4 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition">確定刪除</button>
            </div>
          </div>
        </div>
      )}

      {/* Share Code Modal */}
      {shareCode && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl animate-fade-in-up">
            <h3 className="text-xl font-bold text-gray-900 text-center mb-4">分享設定</h3>
            <div className="space-y-3">
              <button
                onClick={shareToLineBot}
                disabled={isSendingLine || !currentPatientId}
                className="w-full py-4 px-4 bg-teal-600 text-white font-bold rounded-xl hover:bg-teal-700 transition shadow-lg disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <span className="text-xl">🤖</span> {isSendingLine ? '推送中...' : '透過 LINE Bot 推送'}
              </button>
              <button onClick={shareToLine} className="w-full py-4 px-4 bg-[#06C755] text-white font-bold rounded-xl hover:bg-[#05b34c] transition shadow-lg flex items-center justify-center gap-2">
                <span className="text-xl">💬</span> 透過 Line 傳送
              </button>
              <button onClick={copyToClipboard} className="w-full py-3 px-4 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition">複製連結代碼</button>
              <button onClick={() => setShareCode(null)} className="w-full py-2 px-4 text-gray-400 font-medium hover:text-gray-600 transition">關閉</button>
            </div>
          </div>
        </div>
      )}

      {/* Scanned Items Review Modal */}
      {showScanReview && (
        <div className="fixed inset-0 z-[80] bg-black/80 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg h-[85vh] flex flex-col shadow-2xl animate-fade-in-up">
            <div className="p-4 border-b bg-blue-50 rounded-t-2xl">
              <h3 className="text-xl font-bold text-gray-800">📋 確認掃描結果</h3>
              <p className="text-sm text-gray-600 mb-2">偵測到 {scannedItems.length} 個用藥提醒。</p>

              {/* Batch Scan Medicine Bag Button */}
              <button
                onClick={handleBagScanClick}
                className="w-full bg-indigo-500 hover:bg-indigo-600 text-white py-2 px-4 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition shadow"
              >
                <span>📷</span>
                批量掃描藥袋 (校正吃法)
              </button>
              <p className="text-[10px] text-gray-500 mt-1 text-center">可一次選多張藥袋照片，AI 將自動對應藥名並更新時間</p>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {scannedItems.map((entry) => (
                <div key={entry.id} className="border rounded-xl p-3 bg-white shadow-sm flex flex-col gap-2">
                  <div className="flex gap-2">
                    {/* Image Preview & Input */}
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

                      {/* Mini Camera/Gallery Buttons */}
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
                        className="text-[10px] border rounded p-1 w-full bg-gray-50 text-gray-600 outline-none focus:ring-1 focus:ring-blue-300 mt-1"
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
                              className="w-full font-bold text-gray-800 border-b border-gray-200 focus:border-blue-500 outline-none"
                            />

                            {/* Manual Google Search Button */}
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
                          <input type="text" value={entry.item.dosage} onChange={(e) => handleUpdateScannedItem(entry.id, 'dosage', e.target.value)} className="w-full text-sm text-gray-700 border-b border-gray-200 focus:border-blue-500 outline-none" />
                        </div>
                        <div className="flex-1">
                          <label className="text-xs text-gray-500 font-bold text-blue-600">提醒時間</label>
                          <input type="time" value={entry.time} onChange={(e) => handleUpdateScannedItem(entry.id, 'time', e.target.value)} className="w-full text-lg font-bold bg-blue-50 rounded px-2 text-blue-800 outline-none focus:ring-2 focus:ring-blue-300" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-4 border-t flex gap-3 bg-gray-50 rounded-b-2xl">
              <button onClick={() => { setShowScanReview(false); setScannedItems([]); }} className="flex-1 py-3 bg-gray-200 text-gray-700 font-bold rounded-xl hover:bg-gray-300 transition">放棄</button>
              <button onClick={handleConfirmImport} disabled={scannedItems.length === 0} className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition shadow disabled:opacity-50">合併並匯入</button>
            </div>
          </div>
        </div>
      )}

      {isScanning && (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center">
          <div className="bg-white p-6 rounded-2xl flex flex-col items-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-blue-600 mb-4"></div>
            <p className="text-lg font-bold text-gray-800">AI 運算中...</p>
            <p className="text-sm text-gray-500">{scanningMessage || "正在分析影像"}</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default DoctorDashboard;
