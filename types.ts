
// Data interface for a single pill inside a reminder.
// 提醒中的單顆藥物項目介面。
export interface MedicationItem {
  id: string;           // Unique ID for the sub-item / 子項目 ID
  name: string;         // Name of the medicine / 藥物名稱
  dosage: string;       // Dosage instructions / 劑量
  referenceImage: string; // Image for this specific pill / 這顆藥的圖片
  nhiCode?: string;     // NHI Code for searching (e.g., AA58292100) / 健保代碼
}

// Data interface for a Patient
// 患者資料介面
export interface Patient {
  id: string;           // Unique patient ID / 患者唯一 ID
  name: string;         // Patient name / 患者名稱
  lineUserId?: string;  // LINE User ID for push notifications / LINE User ID
  createdAt: number;    // Creation timestamp / 建立時間
}

// Data interface for a Reminder Time Slot.
// 提醒時間點的資料介面 (包含多種藥物)。
export interface Medication {
  id: string;           // Unique identifier (timestamp string) / 唯一識別碼
  time: string;         // Reminder time in "HH:MM" format / 提醒時間
  type: 'medicine' | 'supplement'; // Category / 類別
  audioNote: string;    // Shared audio note for this time / 這個時間點的語音叮嚀

  // List of pills to take at this time.
  // 這個時間點要吃的所有藥物列表。
  subItems: MedicationItem[];

  // Legacy fields for backward compatibility (optional)
  // 相容舊資料欄位 (可選)
  name?: string;
  dosage?: string;
  referenceImage?: string;
  createdAt: number;      // Creation timestamp / 建立時間
}

// Interface for a single item detected from a prescription.
export interface PrescriptionItem {
  name: string;
  dosage: string;
  nhiCode?: string;     // Detected NHI Code / 偵測到的健保碼
  imageUrl?: string;    // AI-detected image URL / AI 搜尋到的圖片網址
  frequency: string;
  suggestedTimes: string[];
}

export enum ViewMode {
  SELECTION = 'SELECTION',
  DOCTOR = 'DOCTOR',
  PATIENT = 'PATIENT'
}
