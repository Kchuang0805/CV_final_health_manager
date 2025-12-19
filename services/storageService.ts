
import { Medication, Patient } from '../types';

// The key used to save data in the browser's LocalStorage.
// 在瀏覽器 LocalStorage 中儲存資料所使用的鍵值名稱。
const STORAGE_KEY_PREFIX = 'medicare_medications_';
const PATIENTS_STORAGE_KEY = 'medicare_patients_v1';
const CURRENT_PATIENT_KEY = 'medicare_current_patient_id';

// Default placeholder image (a generic pill icon).
// 預設圖片 (通用的藥丸圖示)，用於分享碼還原時使用。
const DEFAULT_IMAGE = "https://cdn-icons-png.flaticon.com/512/2966/2966334.png";

// Get storage key for a specific patient
const getPatientMedicationKey = (patientId: string) => `${STORAGE_KEY_PREFIX}${patientId}`;

// --- Patient Management Functions ---

export const getPatients = (): Patient[] => {
  try {
    const data = localStorage.getItem(PATIENTS_STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error("Failed to load patients", error);
    return [];
  }
};

export const addPatient = (name: string, lineUserId?: string): Patient => {
  const patients = getPatients();
  const newPatient: Patient = {
    id: `patient_${Date.now()}`,
    name,
    lineUserId,
    createdAt: Date.now(),
  };

  try {
    localStorage.setItem(PATIENTS_STORAGE_KEY, JSON.stringify([...patients, newPatient]));
  } catch (e) {
    alert("儲存患者資料失敗！");
  }

  return newPatient;
};

export const updatePatient = (patientId: string, updates: Partial<Patient>): void => {
  const patients = getPatients();
  const index = patients.findIndex(p => p.id === patientId);

  if (index >= 0) {
    patients[index] = { ...patients[index], ...updates };
    try {
      localStorage.setItem(PATIENTS_STORAGE_KEY, JSON.stringify(patients));
    } catch (e) {
      alert("更新患者資料失敗！");
    }
  }
};

export const deletePatient = (patientId: string): void => {
  const patients = getPatients().filter(p => p.id !== patientId);
  // Also delete medications for this patient
  try {
    localStorage.removeItem(getPatientMedicationKey(patientId));
    localStorage.setItem(PATIENTS_STORAGE_KEY, JSON.stringify(patients));
  } catch (error) {
    console.error("Failed to delete patient", error);
  }
};

export const getCurrentPatientId = (): string | null => {
  try {
    return localStorage.getItem(CURRENT_PATIENT_KEY);
  } catch (e) {
    return null;
  }
};

export const setCurrentPatientId = (patientId: string): void => {
  try {
    localStorage.setItem(CURRENT_PATIENT_KEY, patientId);
  } catch (e) {
    console.warn('Failed to set current patient id', e);
  }
};

// Helper to compress image before storage.
// Browsers have limited LocalStorage (usually ~5MB), so we reduce image size.
// 壓縮圖片的輔助函式。
// 因為瀏覽器的 LocalStorage 容量有限 (通常約 5MB)，我們必須縮小圖片。
export const compressImage = (sourceStr: string, maxWidth = 400): Promise<string> => {
  return new Promise((resolve) => {
    // 1. If it is a remote URL (http/https), do NOT compress.
    // Remote images often have CORS policies preventing canvas manipulation.
    // Also, we want to support direct hotlinking (with no-referrer) which requires the original URL.
    // 如果是遠端網址 (http/https)，不進行壓縮，直接回傳原始網址。
    // 這能避免 CORS 錯誤，並允許透過 no-referrer 顯示防盜連圖片。
    if (sourceStr.startsWith('http://') || sourceStr.startsWith('https://')) {
      resolve(sourceStr);
      return;
    }

    // 2. If it's already a short string, don't compress.
    if (sourceStr.length < 500) {
      resolve(sourceStr);
      return;
    }

    const img = new Image();
    // Try to enable CORS to allow drawing external images to canvas
    // 嘗試啟用 CORS 以允許將外部圖片繪製到 Canvas
    img.crossOrigin = "Anonymous";
    img.src = sourceStr;

    img.onload = () => {
      try {
        // Create a canvas to redraw the image at a smaller size
        // 建立一個 Canvas 來重繪較小尺寸的圖片
        const canvas = document.createElement('canvas');
        const ratio = maxWidth / img.width;
        canvas.width = maxWidth;
        canvas.height = img.height * ratio;
        const ctx = canvas.getContext('2d');

        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          // Export as JPEG with 0.6 quality compression
          // 匯出為品質 0.6 的 JPEG 格式
          resolve(canvas.toDataURL('image/jpeg', 0.6));
        } else {
          resolve(sourceStr);
        }
      } catch (e) {
        // If canvas becomes "tainted" due to CORS (e.g. DrugTw image), we cannot call toDataURL.
        // In this case, just return the original URL string.
        // 如果因為 CORS 導致 Canvas 被「污染」，我們無法呼叫 toDataURL。
        // 此時直接回傳原始 URL 字串。
        console.warn("Cannot compress external image due to CORS, saving original URL:", e);
        resolve(sourceStr);
      }
    };

    img.onerror = () => {
      // If image fails to load, resolve with original string
      resolve(sourceStr);
    };
  });
};

// Retrieve all medications from LocalStorage for current patient.
// 從 LocalStorage 讀取當前患者的所有藥物資料。
export const getMedications = (patientId?: string): Medication[] => {
  try {
    const id = patientId || getCurrentPatientId();
    if (!id) return [];
    const data = localStorage.getItem(getPatientMedicationKey(id));
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error("Failed to load medications", error);
    return [];
  }
};

// Save a new medication to LocalStorage for current patient.
// 儲存一筆新的藥物資料到 LocalStorage。
export const saveMedication = (medication: Medication, patientId?: string): void => {
  const id = patientId || getCurrentPatientId();
  if (!id) {
    alert("請先選擇患者！");
    return;
  }

  const current = getMedications(id);
  // If editing, replace the item with the same ID. Otherwise add new.
  // 如果是編輯，替換相同 ID 的項目。否則新增。
  const existingIndex = current.findIndex(m => String(m.id) === String(medication.id));

  let updated;
  if (existingIndex >= 0) {
    updated = [...current];
    updated[existingIndex] = medication;
  } else {
    updated = [...current, medication];
  }

  try {
    localStorage.setItem(getPatientMedicationKey(id), JSON.stringify(updated));
  } catch (e) {
    // Handle "Quota Exceeded" error if LocalStorage is full.
    // 處理 LocalStorage 空間不足的錯誤。
    alert("儲存空間已滿！請刪除舊的提醒或縮減圖片大小。");
  }
};

// Delete a medication by ID.
// 透過 ID 刪除藥物。
export const deleteMedication = (id: string, patientId?: string): void => {
  const pid = patientId || getCurrentPatientId();
  if (!pid) return;

  try {
    const current = getMedications(pid);
    // Use String() conversion to ensure safe comparison even if IDs are numbers.
    // 強制轉為字串比較，確保即使 ID 是數字也能正確篩選。
    const updated = current.filter(m => String(m.id) !== String(id));
    localStorage.setItem(getPatientMedicationKey(pid), JSON.stringify(updated));
  } catch (error) {
    console.error("Failed to delete medication", error);
    throw error;
  }
};

// Export all data to a JSON blob URL for downloading.
// 將所有資料匯出為 JSON Blob URL 供下載。
export const exportConfig = (patientId?: string): string => {
  const data = JSON.stringify(getMedications(patientId), null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  return URL.createObjectURL(blob);
};

// Import data from a JSON file content string.
// 從 JSON 字串匯入資料。
export const importConfig = (jsonContent: string, patientId?: string): boolean => {
  const id = patientId || getCurrentPatientId();
  if (!id) {
    alert("請先選擇患者！");
    return false;
  }

  try {
    const parsed = JSON.parse(jsonContent);
    if (Array.isArray(parsed)) {
      // Basic validation: check if items have 'id' and 'name'.
      // 基本驗證：檢查項目是否包含 'id' 和 'name'。
      const isValid = parsed.every(item => item.id && (item.name || item.subItems));
      if (isValid) {
        localStorage.setItem(getPatientMedicationKey(id), jsonContent);
        return true;
      }
    }
    return false;
  } catch (e) {
    console.error("Import failed", e);
    return false;
  }
};

// --- New Features for Cross-Device Sharing ---
// --- 跨裝置分享的新功能 ---

// Generate a lightweight share string (removes images/audio to keep it short).
// 產生輕量化的分享碼 (移除圖片和音訊以縮短長度，方便透過 Line/Messenger 傳送)。
export const generateShareCode = (patientId?: string): string => {
  const data = getMedications(patientId).map(m => ({
    ...m,
    referenceImage: DEFAULT_IMAGE, // Reset image to default / 重置圖片為預設
    audioNote: '', // Remove audio / 移除音訊
    subItems: m.subItems?.map(s => ({ ...s, referenceImage: DEFAULT_IMAGE }))
  }));

  const jsonString = JSON.stringify(data);
  // Handle UTF-8 encoding for Chinese characters before Base64
  // 處理中文字元的 UTF-8 編碼，然後轉為 Base64
  return btoa(unescape(encodeURIComponent(jsonString)));
};

// Parse the share string and merge with existing data.
// 解析分享碼並存入資料。
export const importShareCode = (code: string, patientId?: string): boolean => {
  const id = patientId || getCurrentPatientId();
  if (!id) {
    alert("請先選擇患者！");
    return false;
  }

  try {
    // Decode Base64 with UTF-8 support
    // 支援 UTF-8 的 Base64 解碼
    const jsonString = decodeURIComponent(escape(window.atob(code)));
    const parsed = JSON.parse(jsonString);

    if (Array.isArray(parsed) && parsed.every(item => item.time)) {
      // Overwrite current data with shared data
      // 用分享的資料覆蓋目前資料
      localStorage.setItem(getPatientMedicationKey(id), JSON.stringify(parsed));
      return true;
    }
    return false;
  } catch (e) {
    console.error("Invalid share code", e);
    return false;
  }
};
