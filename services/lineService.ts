// 自動偵測：如果在遠端域名上，使用 localtunnel URL；否則使用本地
const API_BASE = typeof window !== 'undefined' && window.location.hostname === 'medicare.anontaiwan.meme'
    ? 'https://linebot.anontaiwan.meme'
    : (import.meta.env.VITE_LINE_BOT_API as string | undefined) || 'http://127.0.0.1:5487';

console.log('🔧 lineService API_BASE:', API_BASE);

export interface LineBotMedicationPayload {
    userId: string;
    medicationData: any; // Complete medication JSON
}

export const sendLineNotification = async ({ userId, medicationData }: LineBotMedicationPayload): Promise<void> => {
    const response = await fetch(`${API_BASE}/api/web-to-bot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, query: JSON.stringify(medicationData) }),
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(text || 'LINE bot request failed');
    }
};
