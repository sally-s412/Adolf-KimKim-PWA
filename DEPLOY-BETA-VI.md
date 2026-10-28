# Beta miễn phí

Chạy `pip install -r requirements-api.txt`, sau đó `uvicorn beta:app --host 0.0.0.0 --port $PORT --workers 1`.
Web PWA và API dùng chung một domain. Giữ nguyên Firebase project adolfkimkim.
Thêm hostname Render vào Firebase Authentication > Settings > Authorized domains để đăng nhập Google.

## Render
- Python 3.12, plan Free, 1 instance; không tạo Postgres/Redis/disk.
- FIREBASE_PROJECT_ID=adolfkimkim
- STT_PROVIDER=groq
- GROQ_MODEL=openai/gpt-oss-20b (model do Groq phục vụ, không cần OpenAI key)
- GROQ_STT_MODEL=whisper-large-v3-turbo
- GROQ_API_KEY: nhập trong Render Environment, không commit vào git.
- BETA_USER_RPM=10, BETA_GLOBAL_RPM=25. Chặn burst trong một process; không phải hạn mức tiền và reset khi restart.

## Điều kiện để không mất phí
Giữ tài khoản Groq Free, không nâng cấp/không tự chuyển provider. Quota thực tế xem Groq Console.
Render Free vẫn chịu quota bandwidth/build. Nếu có thẻ trên tài khoản, kiểm tra giới hạn chi tiêu trong Billing để tránh overage; chọn Free không tự bảo đảm mọi khoản phí bằng 0.
Không dùng ping giả để giữ máy chủ thức. Sau 15 phút không hoạt động, có cold start khoảng một phút.
Chưa kiểm tra Firebase billing và Security Rules; Storage có thể yêu cầu Blaze. Không cam kết toàn bộ Firebase miễn phí.

## Tính năng
- Auth Firebase được xác minh bằng chữ ký token ở API. Không kiểm tra token revocation ngay lập tức.
- Chat, tóm tắt, mindmap cần Groq key; xuất PPTX/PNG không gọi model.
- Tải file/ghi âm rồi phiên âm: Groq Whisper, tối đa 20 MB/file; không phân biệt người nói.
- Realtime STT và KimKim vào Meet cần speech/meeting worker riêng; chưa triển khai trong server beta này.
- Muốn thử đầy đủ miễn phí: chạy worker từ source trên máy cá nhân (cần máy đang bật, mạng và tài nguyên của bạn). Không bảo đảm worker gốc hoạt động trước khi thử với cuộc họp thật.

## Kiểm tra sau deploy
GET /health, trang login, đăng nhập Firebase, API không token trả 401.
Nhập Groq key rồi kiểm tra chat/tóm tắt/phiên âm bằng tài khoản thật. Không coi /health OK là AI đã hoạt động.
