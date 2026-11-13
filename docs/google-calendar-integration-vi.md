# Google Calendar trong ADOLF KIMKIM

## Phạm vi phiên bản
- Mở Lịch > Kết nối Google Calendar và cấp quyền bằng đúng tài khoản Google đăng nhập KimKim.
- Hiển thị lịch chính của tài khoản Google cùng lịch riêng KimKim, không sao chép sự kiện Google vào Firestore.
- Đọc sự kiện từ tháng trước đến hết tháng sau quanh tháng đang xem; chuyển tháng để tải khoảng mới. Có phân trang.
- Làm mới thủ công và mỗi 60 giây khi tab đang hiển thị. Không phải webhook hoặc đồng bộ nền khi app đóng.
- Tạo, sửa, xóa sự kiện Google trực tiếp. Khi tạo chọn Lưu vào > Google Calendar; lịch riêng KimKim là mặc định.
- Có thể tạo link Google Meet bằng checkbox trong form. Google có thể cần thời gian xử lý link; bấm Làm mới để lấy link.
- Mời KimKim vào Meet vẫn dùng luồng Meeting hiện có, không tự động mời bot.
- Sự kiện lặp được hiển thị theo từng lần; sửa/xóa tác động lần đang chọn, không toàn bộ chuỗi.
- Token OAuth chỉ nằm trong bộ nhớ phiên, xóa khi logout/đổi tài khoản/ngắt kết nối. Hết hạn cần kết nối lại. Ngắt kết nối trong app không thu hồi toàn bộ quyền đã cấp trong Google; người dùng có thể thu hồi tại https://myaccount.google.com/permissions.
- Hiện cần tài khoản đăng nhập Google; chưa liên kết thêm Google cho tài khoản email/password.
- Phạm vi Google OAuth: https://www.googleapis.com/auth/calendar.events.

## Cấu hình quản trị cần thiết
Dùng đúng Google Cloud project gắn với Firebase Auth:
1. APIs & Services > Library > Google Calendar API > Enable.
2. Google Auth Platform > Data Access: thêm scope calendar.events.
3. Audience: nếu ứng dụng ở Testing, thêm email người dùng thử vào Test users. Để người dùng công khai sử dụng, hoàn thiện consent screen và quy trình xác minh scope Google yêu cầu.
4. Firebase Authentication > Settings > Authorized domains phải có adolf-kimkim-pwa.onrender.com. Giữ cấu hình OAuth Firebase Google sign-in hiện có.
5. Không đặt client secret/access token trong frontend hoặc Firestore.
Không yêu cầu thay đổi Firebase Rules hoặc cấu hình AI.

## Kiểm tra
6 kiểm tra tự động gồm lịch riêng, Meet handoff, ICS Unicode, validation, OAuth token + API read, lỗi 403/401 và tạo sự kiện Google không ghi trùng Firestore.
Chưa có kiểm tra end-to-end bằng tài khoản Google thật; cần xác nhận quyền Calendar API của project trước khi coi đã hoạt động với người dùng production.
