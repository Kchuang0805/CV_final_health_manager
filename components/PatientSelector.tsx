import React, { useState, useEffect } from 'react';
import { Patient } from '../types';
import { getPatients, addPatient, updatePatient, deletePatient, getCurrentPatientId, setCurrentPatientId } from '../services/storageService';

// 自動偵測：如果在遠端域名上，使用 localtunnel URL；否則使用本地
const API_BASE = window.location.hostname === 'medicare.anontaiwan.meme'
    ? 'https://linebot.anontaiwan.meme'
    : (import.meta.env.VITE_LINE_BOT_API as string | undefined) || 'http://127.0.0.1:5487';

console.log('🔧 API_BASE:', API_BASE, 'Hostname:', window.location.hostname);

interface Props {
    onPatientSelected: (patientId: string) => void;
    currentPatientId: string | null;
}

const PatientSelector: React.FC<Props> = ({ onPatientSelected, currentPatientId }) => {
    const [patients, setPatients] = useState<Patient[]>([]);
    const [showAddForm, setShowAddForm] = useState(false);
    const [newPatientName, setNewPatientName] = useState('');
    const [newPatientLineId, setNewPatientLineId] = useState('');
    const [editingPatientId, setEditingPatientId] = useState<string | null>(null);
    const [editingName, setEditingName] = useState('');
    const [editingLineId, setEditingLineId] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const [searchMessage, setSearchMessage] = useState('');

    useEffect(() => {
        loadPatients();
    }, []);

    const loadPatients = () => {
        setPatients(getPatients());
    };

    const searchPatientLineId = async (name: string) => {
        if (!name.trim()) return;

        setIsSearching(true);
        setSearchMessage('');

        const searchUrl = `${API_BASE}/api/search-patient`;
        console.log('🔍 Searching patient:', name.trim(), 'at', searchUrl);

        try {
            const response = await fetch(searchUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: name.trim() }),
            });

            console.log('📡 Response status:', response.status);
            const data = await response.json();
            console.log('📦 Response data:', data);

            if (data.found) {
                setNewPatientLineId(data.lineUserId);
                setSearchMessage(`✅ 找到患者！LINE ID: ${data.lineUserId}`);
            } else {
                setSearchMessage(`⚠️ ${data.message}`);
            }
        } catch (error) {
            console.error('❌ Search error:', error);
            setSearchMessage('❌ 搜尋失敗，請確認後端伺服器是否運行');
        } finally {
            setIsSearching(false);
        }
    };

    const handleAddPatient = () => {
        if (!newPatientName.trim()) {
            alert('請輸入患者名稱');
            return;
        }

        const patient = addPatient(newPatientName, newPatientLineId);
        setPatients(getPatients());
        setNewPatientName('');
        setNewPatientLineId('');
        setShowAddForm(false);
        onPatientSelected(patient.id);
    };

    const handleSelectPatient = (patientId: string) => {
        setCurrentPatientId(patientId);
        onPatientSelected(patientId);
    };

    const handleUpdatePatient = (patientId: string) => {
        if (!editingName.trim()) {
            alert('請輸入患者名稱');
            return;
        }

        updatePatient(patientId, {
            name: editingName,
            lineUserId: editingLineId,
        });
        setPatients(getPatients());
        setEditingPatientId(null);
        setEditingName('');
        setEditingLineId('');
    };

    const handleDeletePatient = (patientId: string) => {
        if (window.confirm('確定要刪除此患者及其所有藥物資料嗎？')) {
            deletePatient(patientId);
            setPatients(getPatients());
            if (currentPatientId === patientId) {
                const remaining = getPatients();
                if (remaining.length > 0) {
                    handleSelectPatient(remaining[0].id);
                } else {
                    onPatientSelected('');
                }
            }
        }
    };

    const startEditing = (patient: Patient) => {
        setEditingPatientId(patient.id);
        setEditingName(patient.name);
        setEditingLineId(patient.lineUserId || '');
    };

    return (
        <div className="bg-white rounded-xl shadow-md p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-lg text-gray-800">👥 選擇患者</h3>
                <button
                    onClick={() => setShowAddForm(!showAddForm)}
                    className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded text-sm font-bold transition"
                >
                    + 新增患者
                </button>
            </div>

            {/* Add Patient Form */}
            {showAddForm && (
                <div className="bg-blue-50 p-3 rounded-lg mb-3 border border-blue-200">
                    <div className="mb-2">
                        <input
                            type="text"
                            placeholder="患者名稱"
                            value={newPatientName}
                            onChange={(e) => setNewPatientName(e.target.value)}
                            onBlur={(e) => searchPatientLineId(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded"
                        />
                        <button
                            onClick={() => searchPatientLineId(newPatientName)}
                            disabled={isSearching || !newPatientName.trim()}
                            className="w-full mt-1 bg-green-500 hover:bg-green-600 disabled:bg-gray-300 text-white py-1 px-2 rounded text-xs font-bold transition"
                        >
                            {isSearching ? '🔍 搜尋中...' : '🔍 搜尋 LINE ID'}
                        </button>
                    </div>
                    {searchMessage && (
                        <div className={`text-xs p-2 rounded mb-2 ${searchMessage.startsWith('✅') ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                            {searchMessage}
                        </div>
                    )}
                    <input
                        type="text"
                        placeholder="LINE User ID (選擇性或自動搜尋)"
                        value={newPatientLineId}
                        onChange={(e) => setNewPatientLineId(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded mb-2"
                    />
                    <div className="flex gap-2">
                        <button
                            onClick={handleAddPatient}
                            className="flex-1 bg-blue-500 text-white py-2 rounded font-bold hover:bg-blue-600"
                        >
                            確認
                        </button>
                        <button
                            onClick={() => setShowAddForm(false)}
                            className="flex-1 bg-gray-300 text-gray-700 py-2 rounded font-bold hover:bg-gray-400"
                        >
                            取消
                        </button>
                    </div>
                </div>
            )}

            {/* Patient List */}
            <div className="space-y-2">
                {patients.length === 0 ? (
                    <p className="text-gray-500 text-sm">沒有患者，請先新增</p>
                ) : (
                    patients.map((patient) => (
                        <div
                            key={patient.id}
                            className={`p-3 rounded-lg border-2 transition ${currentPatientId === patient.id
                                ? 'border-blue-500 bg-blue-50'
                                : 'border-gray-200 bg-gray-50 hover:bg-gray-100'
                                }`}
                        >
                            {editingPatientId === patient.id ? (
                                <div className="space-y-2">
                                    <input
                                        type="text"
                                        value={editingName}
                                        onChange={(e) => setEditingName(e.target.value)}
                                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                    />
                                    <input
                                        type="text"
                                        placeholder="LINE User ID"
                                        value={editingLineId}
                                        onChange={(e) => setEditingLineId(e.target.value)}
                                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                    />
                                    <div className="flex gap-2 text-xs">
                                        <button
                                            onClick={() => handleUpdatePatient(patient.id)}
                                            className="flex-1 bg-green-500 text-white py-1 rounded hover:bg-green-600"
                                        >
                                            保存
                                        </button>
                                        <button
                                            onClick={() => setEditingPatientId(null)}
                                            className="flex-1 bg-gray-400 text-white py-1 rounded hover:bg-gray-500"
                                        >
                                            取消
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div>
                                    <div
                                        onClick={() => handleSelectPatient(patient.id)}
                                        className="cursor-pointer mb-2"
                                    >
                                        <p className="font-bold text-gray-800">{patient.name}</p>
                                        {patient.lineUserId && (
                                            <p className="text-xs text-gray-600">ID: {patient.lineUserId}</p>
                                        )}
                                    </div>
                                    <div className="flex gap-2 text-xs">
                                        <button
                                            onClick={() => startEditing(patient)}
                                            className="flex-1 bg-yellow-500 text-white py-1 rounded hover:bg-yellow-600"
                                        >
                                            編輯
                                        </button>
                                        <button
                                            onClick={() => handleDeletePatient(patient.id)}
                                            className="flex-1 bg-red-500 text-white py-1 rounded hover:bg-red-600"
                                        >
                                            刪除
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default PatientSelector;
