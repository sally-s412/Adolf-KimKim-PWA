# Triển khai beta — giữ nguyên AI engineer source

Chạy `pip install -r requirements-api.txt`, sau đó `uvicorn beta:app --host 0.0.0.0 --port $PORT --workers 1`.
Web PWA và API dùng chung domain. Firebase project: adolfkimkim.

## Quy tắc bảo toàn AI
Toàn bộ file Python trong routes/ và speech/ khớp byte với ZIP source gốc người dùng gửi.
Không sửa model, provider, prompt, tham số sinh, key, cách phân tích kết quả hoặc diarization để phù hợp hosting.
Các tên model trong source được giữ nguyên theo AI engineer; không tự sửa dù có lỗi provider.
`tests/ai-source.sha256.json` và `tests/test_ai_source.py` kiểm tra hash chống thay đổi vô tình.

## Cấu hình
Giữ nguyên các secret và endpoint do AI engineer cung cấp. Không tạo, thay hoặc ghi đè API key.
Các biến GROQ_MODEL, GROQ_STT_MODEL và STT_PROVIDER do bản beta trước thêm không được implementation AI gốc sử dụng; không còn chuyển model hoặc gọi Whisper theo các biến này.
`SPEECH_SERVICE_URL` vẫn được source gốc đọc; localhost:2609 là mặc định gốc, không có nghĩa speech worker đã chạy trên Render.
Firebase token được xác minh ở wrapper beta.py; wrapper không sửa payload hoặc output AI.
Giới hạn burst beta BETA_USER_RPM/BETA_GLOBAL_RPM là bảo vệ API, không phải thay đổi model.

## Trạng thái hosting
Render Free hiện chạy web + API. Speech Gipformer/diarization, realtime speech và Google Meet worker chưa được triển khai đầy đủ.
Không thay engine để lấp phần thiếu hạ tầng. Meet trả lỗi chưa có worker rõ ràng.
Nếu cần máy chủ lớn hơn, đánh giá hạ tầng trước và trao đổi chi phí; không tự đổi pipeline AI.
Không cam kết output end-to-end trước khi có đúng secret, endpoint và worker của AI engineer và bộ dữ liệu kiểm thử.

## Kiểm tra
`python -m unittest discover -s tests -p 'test_*.py'`
`npm test`
Sau deploy kiểm tra /health và API không token trả 401. Không coi các kiểm tra này là chứng minh chất lượng AI.
