import logging
import os
from pathlib import Path
import json
from linebot import LineBotApi
from linebot.models import TextSendMessage, ImageSendMessage
from dotenv import load_dotenv
from flask import Flask, request, jsonify
from flask_cors import CORS
from apscheduler.schedulers.background import BackgroundScheduler
from datetime import datetime
from linebot.v3.exceptions import InvalidSignatureError
from linebot.v3.webhook import WebhookHandler
from linebot.v3.webhooks.models import MessageEvent, FollowEvent, TextMessageContent

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("medicare.linebot")
logger.setLevel(logging.INFO)
logger.propagate = True
if not logger.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
    logger.addHandler(handler)

BASE_DIR = Path(__file__).resolve().parent
ROOT_DIR = BASE_DIR.parent
load_dotenv(BASE_DIR / ".env.local")
load_dotenv(ROOT_DIR / ".env.local")

LINE_CHANNEL_SECRET = os.getenv("LINE_CHANNEL_SECRET", "")
LINE_CHANNEL_ACCESS_TOKEN = os.getenv("LINE_CHANNEL_ACCESS_TOKEN", "")
DEFEAULT_IMAGE_URL = "https://cdn-icons-png.flaticon.com/512/2966/2966334.png"


line_bot_api = LineBotApi(LINE_CHANNEL_ACCESS_TOKEN)

app = Flask(__name__)
# Allow Vite/dev origin to call the Flask endpoint
CORS(app, resources={r"/api/*": {"origins": ["http://localhost:5173", "http://127.0.0.1:5173", "*"]}})

def read_json(path):
    with open(path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    return data

def write_json(path, data):
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def initialize():
    os.makedirs(f'{BASE_DIR}/JSON', exist_ok=True)
    if not os.path.exists(f'{BASE_DIR}/JSON/userlist.json'):
        write_json(f'{BASE_DIR}/JSON/userlist.json', [])
    if not os.path.exists(f'{BASE_DIR}/JSON/registered.json'):
        write_json(f'{BASE_DIR}/JSON/registered.json', {})
    if not os.path.exists(f'{BASE_DIR}/JSON/unregistered.json'):
        write_json(f'{BASE_DIR}/JSON/unregistered.json', [])

def send_message_to_user(target_user_id, message_text):
    """
    使用 Push Message 推播文字訊息給指定用戶
    """
    try:
        message = TextSendMessage(text=message_text)
        
        line_bot_api.push_message(target_user_id, message)
        
        print(f"Successfully pushed message to {target_user_id}")
        return True
    
    except Exception as e:
        logger.error(f"Error sending message: {e}")
        return False

def send_image_to_user(target_user_id: str, original_image_url: str, preview_image_url: str):
    """
    使用 Push Message 推播圖片訊息給指定用戶。

    Args:
        target_user_id: Line 用戶的 ID (U 開頭)。
        original_image_url: 圖片的公開 HTTPS 網址。
        preview_image_url: 圖片縮圖的公開 HTTPS 網址。
    """
    try:
        # 1. 建立 ImageSendMessage 物件
        image_message = ImageSendMessage(
            original_content_url=original_image_url,
            preview_image_url=preview_image_url
        )
        
        # 2. 呼叫 line_bot_api 的 push_message 方法
        line_bot_api.push_message(target_user_id, image_message)
        
        print(f"✅ Successfully pushed image message to {target_user_id}")
        return True
    
    except Exception as e:
        print(f"❌ Error sending image message: {e}")
        return False

def check_and_push_messages():
    """
    檢查是否有需要推送的訊息，並執行推送
    """
    # 這裡可以加入邏輯來檢查是否有新的訊息需要推送
    # 例如從資料庫或檔案中讀取待推送的訊息清單
    # 然後呼叫 send_message_to_user 函式來推送訊息
    userlist = read_json(f'{BASE_DIR}/JSON/userlist.json')
    
    for user_id in userlist:
        data = read_json(f'{BASE_DIR}/JSON/{user_id}.json')
        
        if data is None:
            continue
        
        for item in data:
            time = datetime.strptime(item.get('time', ''), '%H:%M')
            if datetime.now().hour == time.hour and datetime.now().minute == time.minute:
                    images = item.get('subItems', None)
                    medicine_names = item.get('name', '未知藥品').split(',')
                    dosages = item.get('dosage', '未知劑量').split(',')
                    for i in range(len(images or [])):
                        medicine_name = medicine_names[i] if i < len(medicine_names) else '未知藥品'
                        dosage = dosages[i] if i < len(dosages) else '未知劑量'
                        item = images[i]
                        image_url = item.get('referenceImage', None)
                        
                        message = f"提醒您服用藥物：{medicine_name}\n劑量：{dosage}。" if i == 0 else f"接著服用藥物：{medicine_name}\n劑量：{dosage}。"
                        
                        send_message_to_user(user_id, message)
                        if image_url != DEFEAULT_IMAGE_URL:
                            send_image_to_user(user_id, image_url, image_url)
                
    pass

def scheduled_task():
    print("執行定時任務：檢查並推送訊息給用戶")
    check_and_push_messages()

@app.route('/api/search-patient', methods=['POST'])
def search_patient():
    """
    根據患者名稱搜尋 registered.json 中的 LINE User ID
    """
    logger.info("\n=== Received request at /api/search-patient ===")
    try:
        data = request.get_json()
        logger.info(f"Request data: {data}")
        
        patient_name = data.get('name', '').strip()
        logger.info(f"Searching for patient: '{patient_name}'")
        
        if not patient_name:
            logger.warning("Patient name is empty")
            return jsonify({'error': 'Patient name is required'}), 400
        
        registered_path = f'{BASE_DIR}/JSON/registered.json'
        logger.info(f"Reading from: {registered_path}")
        
        registered_users = read_json(registered_path)
        logger.info(f"Registered users data: {registered_users}")
        
        # 搜尋匹配的患者名稱
        line_user_id = registered_users.get(patient_name)
        logger.info(f"Search result for '{patient_name}': {line_user_id}")
        
        if line_user_id:
            logger.info(f"✅ Found patient: {patient_name} -> {line_user_id}")
            return jsonify({
                'found': True,
                'name': patient_name,
                'lineUserId': line_user_id
            }), 200
        else:
            logger.warning(f"❌ Patient not found: {patient_name}")
            logger.info(f"Available patients: {list(registered_users.keys())}")
            return jsonify({
                'found': False,
                'message': f'找不到患者 "{patient_name}"'
            }), 404
    
    except Exception as e:
        logger.error(f"Error searching patient: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500

@app.route('/api/web-to-bot', methods=['POST'])
def handle_web_request():
    logger.info("=== Received request at /api/web-to-bot ===")
    
    # 1. 嘗試一次性解析 JSON
    try:
        # 使用 request.get_json() 嘗試解析，如果失敗會返回 None 或拋出錯誤
        # 設置 silent=True 可以讓 Flask 在 Content-Type 不匹配時不拋出 500
        request_data = request.get_json(silent=True) 
        
        if not request_data:
            # 如果解析失敗 (例如 Content-Type 錯誤)，嘗試讀取原始資料以供日誌
            raw_body = request.get_data(as_text=True)
            logger.error(f'Invalid JSON or missing body. Raw body: {raw_body[:100]}...')
            return jsonify({'status': 'error', 'message': 'Invalid JSON or missing body. Ensure Content-Type is application/json.'}), 400
            
    except Exception as e:
        logger.exception("JSON parsing failed")
        return jsonify({'status': 'error', 'message': f'Internal parsing error: {str(e)}'}), 500


    # 2. 獲取並驗證關鍵資料
    target_user_id = request_data.get('user_id')
    query_content = request_data.get('query')
    
    if not (query_content and target_user_id):
        logger.warning(f"Missing required fields. User ID: {target_user_id}, Query: {query_content}")
        return jsonify({'status': 'error', 'message': 'Missing user_id or query content'}), 400
        
    logger.info(f"Processing request for User ID: {target_user_id}")

    # 3. 處理 userlist 儲存
    try:
        userlist = read_json(f'{BASE_DIR}/JSON/userlist.json')
        # 這是更 Pythonic 的檢查和添加方法
        if target_user_id not in userlist:
            userlist.append(target_user_id) 
            write_json(f'{BASE_DIR}/JSON/userlist.json', userlist)
            logger.info(f"User ID {target_user_id} added to userlist.")
    except Exception as e:
        logger.error(f"Failed to update userlist: {e}")

    try:
        inner_json_str = '[' + query_content[1:-1].replace('\\"', '"') + ']'
        json_data = json.loads(inner_json_str)
        
        write_json(f'{BASE_DIR}/JSON/{target_user_id}.json', json_data)
        logger.info(f"Successfully saved schedule data for user {target_user_id}.")

    except Exception as e:
        logger.exception(f"Failed to parse or save schedule JSON for query: {query_content}")
        # 如果排程資料有問題，應該回覆錯誤
        return jsonify({'status': 'error', 'message': f'Failed to parse or save schedule data: {str(e)}'}), 400

    # 5. 成功回覆
    return jsonify({'status': 'success', 'message': 'Request processed and schedule saved'}), 200

# 這是 Line Bot 專門接收 Webhook 請求的路由


# 假設您已經定義了這些 Line 憑證和 line_bot_api

handler = WebhookHandler(LINE_CHANNEL_SECRET)

@app.route("/callback", methods=['POST'])
def callback():
    # 取得請求標頭中的 X-Line-Signature
    signature = request.headers['X-Line-Signature']

    # 取得請求體作為文字
    body = request.get_data(as_text=True)
    
    # 處理 Webhook 主體
    try:
        handler.handle(body, signature)
    except InvalidSignatureError:
        print("Invalid signature. Please check your channel access token/secret.")
        return 'Invalid signature', 400

    return 'OK'

# --- 事件處理函數 ---

@handler.add(FollowEvent)
def handle_follow(event: FollowEvent):
    """處理用戶關注/加好友事件"""
    user_id = event.source.user_id
    
    unregistered_users = read_json(f'{BASE_DIR}/JSON/unregistered.json')
    if user_id not in unregistered_users:
        unregistered_users.append(user_id)
        write_json(f'{BASE_DIR}/JSON/unregistered.json', unregistered_users)
    
    logger.info(f"🎉 New user followed! User ID: {user_id}")
    
    # 💡 關鍵步驟：將 user_id 儲存到資料庫中
    # save_user_id_to_db(user_id) 
    
    # 可以選擇發送歡迎訊息
    # line_bot_api.reply_message(event.reply_token, TextMessage(text='感謝您的關注！'))


@handler.add(MessageEvent)
def handle_message(event: MessageEvent):
    """處理用戶傳送訊息事件"""
    user_id = event.source.user_id
    message = event.message.text
    unregistered_users = read_json(f'{BASE_DIR}/JSON/unregistered.json')
    if user_id in unregistered_users:
        
        registered_users = read_json(f'{BASE_DIR}/JSON/registered.json')
        registered_users[str(message)] = user_id
        write_json(f'{BASE_DIR}/JSON/registered.json', registered_users)
        
        unregistered_users.remove(user_id)
        write_json(f'{BASE_DIR}/JSON/unregistered.json', unregistered_users)
    
    
    
    # 這裡可以根據訊息內容做回覆
    if isinstance(event.message, TextMessageContent):
        text = event.message.text
        # line_bot_api.reply_message(event.reply_token, TextMessage(text=f"您傳送了：{text}"))

if __name__ == '__main__':
    initialize()
    scheduler = BackgroundScheduler()
    scheduled_task()
    scheduler.add_job(scheduled_task, 'interval', minutes=1)
    scheduler.start()
    app.run(host='0.0.0.0', port=5487)
