# Hướng dẫn cấu hình KimKim Capsule

## Trạng thái hiện tại

Mã giao diện KimKim Finance và KimKim Capsule cùng API Capsule đã được triển khai. Gửi email hẹn giờ chưa được kích hoạt và chưa được kiểm thử với hộp thư thật. Người dùng vẫn có thể soạn và lưu bản nháp. Không bật nhận thư hẹn giờ trước khi hoàn tất các bước bên dưới.

Finance và bản nháp Capsule lưu trong các bộ sưu tập con thuộc tài khoản Firebase của từng người. Thư đã niêm phong nằm trong bộ sưu tập riêng `kimkimCapsules`, chỉ backend được truy cập. Không cấp quyền đọc/ghi trực tiếp bộ sưu tập này cho ứng dụng phía người dùng.

## 1. Cấu hình backend trong Render — Gmail API

Mở Environment của dịch vụ **adolf-kimkim-beta**, không nhập các khóa này vào dịch vụ giao diện tĩnh:

https://dashboard.render.com/web/srv-dbh5o06c6qcc73fv34r0/env

| Tên biến — giữ nguyên khi nhập | Nội dung cần điền |
| --- | --- |
| `CAPSULE_FIREBASE_SERVICE_ACCOUNT_JSON` | JSON của tài khoản dịch vụ Firebase riêng, thuộc dự án `adolfkimkim`, chỉ cấp quyền dữ liệu Firestore cần thiết. Đây là khóa riêng tư, không phải Firebase web config. |
| `CAPSULE_ENCRYPTION_KEY` | Khóa Fernet cố định để mã hóa thư. Tạo bằng `Fernet.generate_key()` trong môi trường quản trị an toàn. Sao lưu bảo mật; thay khóa tùy tiện sẽ khiến thư cũ không mở được. |
| `CAPSULE_GMAIL_TOKEN_ENCRYPTED` | Nội dung file `gmail-token.encrypted.txt`, tạo trên máy của bạn theo mục 1a bên dưới. Chứa refresh token và OAuth client đã mã hóa. Không nhập JSON thô. |
| `CAPSULE_FROM_EMAIL` | `KimKim <gmail-cua-ban@gmail.com>` — thay bằng đúng Gmail đã cấp quyền gửi. Không cần mua tên miền. |
| `CAPSULE_PUBLIC_ORIGIN` | `https://adolf-kimkim-beta.onrender.com` |
| `CAPSULE_DISPATCH_SECRET` | Chuỗi ngẫu nhiên bí mật tối thiểu 32 ký tự, dùng riêng để xác thực bộ chạy lịch gửi. |
| `CAPSULE_SCHEDULER_ENABLED` | Chỉ đặt `true` sau khi bộ chạy lịch gửi đã được cấu hình và chạy thử thành công ở bước 3. |

Nhập khóa trực tiếp trong Render, không gửi qua chat, không đưa vào GitHub hoặc mã frontend. Lưu và triển khai lại backend để áp dụng thay đổi. Không ghi đè các cấu hình AI hiện có.

Không cần `CAPSULE_RESEND_API_KEY` nữa; backend Capsule không đọc biến này. Không xóa các biến của tính năng khác. Gmail API gửi qua HTTPS, không dùng SMTP hoặc mật khẩu Gmail.

### 1a. Tạo và nhập token Gmail an toàn

1. Bật Gmail API trong Google Cloud. Tạo OAuth client riêng cho công cụ Desktop; chỉ cấp quyền `https://www.googleapis.com/auth/gmail.send`. Không sửa OAuth client Calendar.
2. Hoàn tất cấp quyền trên máy của bạn để có `~/kimkim-gmail/gmail-token.json`. Đây là token của Gmail gửi chung cho KimKim; mỗi người dùng Capsule không cần cấp quyền Gmail riêng. Không dùng JSON Firebase thay token Gmail.
3. Tải mã công cụ từ repository, đúng nhánh đang dùng: `scripts/encrypt-gmail-token.py`. Đặt file đó vào `~/kimkim-gmail/`.
4. Chạy trong Terminal:

```bash
cd ~/kimkim-gmail
source .venv/bin/activate
python3 encrypt-gmail-token.py
```

5. Khi hỏi đường dẫn token, nhấn Enter nếu đã đặt đúng thư mục. Khi hỏi khóa, dán **đúng CAPSULE_ENCRYPTION_KEY đã lưu trên Render**. Terminal không hiện ký tự khi dán; đây là bình thường. Không tạo khóa mới để thay thế.
6. Công cụ tạo `gmail-token.encrypted.txt`, quyền file chỉ chủ máy được đọc/ghi. Mở file bằng trình soạn thảo trên máy, copy toàn bộ nội dung vào biến `CAPSULE_GMAIL_TOKEN_ENCRYPTED` của backend Render. Không gửi file hoặc khóa qua chat, không commit vào GitHub. Xóa bản sao clipboard khi hoàn tất.
7. Điền `CAPSULE_FROM_EMAIL` bằng Gmail đã cấp quyền. Giữ `CAPSULE_SCHEDULER_ENABLED=false` cho tới khi cấu hình xong runner. Save và Deploy backend.

Backend chỉ nhận token đã mã hóa, kiểm tra đúng endpoint Google và quyền chỉ gửi thư; token được giải mã trong bộ nhớ. Access token được xin mới từ Google khi cần; không ghi token ra file trên Render và không trả token về frontend. Việc mã hóa không thay thế quyền kiểm soát tài khoản Render vì khóa giải mã cũng được lưu tại backend.

Nếu app OAuth External ở trạng thái Testing, refresh token có quyền Gmail hết hạn sau 7 ngày. Không nhận thư hẹn dài hạn cho tới khi xử lý trạng thái phát hành/điều kiện xác minh phù hợp. Ngay cả sau đó, token vẫn có thể bị thu hồi; cần theo dõi trạng thái gửi và cấp quyền lại khi cần. Tài liệu Google: https://developers.google.com/identity/protocols/oauth2#expiration

## 2. Kiểm tra Firestore

- Xác nhận quy tắc đang chạy chỉ cho người đăng nhập đọc/ghi dữ liệu tại `/users/{uid}` của chính họ.
- Giữ nguyên việc chặn mọi Firebase client truy cập `kimkimCapsules`.
- Tạo chỉ mục tổng hợp theo `firebase/capsules.indexes.json`: `status` tăng dần và `sendAt` tăng dần. Chờ chỉ mục sẵn sàng.
- Không mở quyền toàn bộ cơ sở dữ liệu để xử lý lỗi thiếu quyền.

## 3. Bật bộ chạy lịch gửi

Cần bộ chạy phía server gọi API mỗi phút, kể cả khi người dùng đóng app. Trình duyệt không đảm nhiệm việc gửi thư.

Mã chạy đã có: `scripts/dispatch-capsules.py`.

Cấu hình một cron runner tin cậy sử dụng đúng nhánh `ui/refine-notes-settings-chat`:

- Lệnh: `python scripts/dispatch-capsules.py`.
- Lịch cron: `* * * * *`.
- Biến môi trường của runner: `CAPSULE_PUBLIC_ORIGIN` và `CAPSULE_DISPATCH_SECRET`, cùng giá trị với backend.
- Runner gửi `POST /api/capsules/dispatch`, xác thực bằng header `X-Capsule-Secret`; không cần nội dung yêu cầu.

Chạy thủ công một lần và kiểm tra thành công trước. Sau đó đặt `CAPSULE_SCHEDULER_ENABLED=true` trên backend và triển khai lại.

Chưa tạo dịch vụ cron trả phí. Nếu chọn Render Cron Job, cần kiểm tra và chấp nhận chi phí trên Render trước khi tạo. Backend miễn phí có thể ngủ nên thư có thể gửi chậm lúc dịch vụ khởi động lại; không cam kết gửi chính xác từng phút với cấu hình này.

## 4. Kiểm thử trước khi mở cho người dùng

1. Xác minh email tài khoản Firebase của người gửi.
2. Soạn, lưu nháp và niêm phong một thư gửi tới hộp thư của chính mình, đặt giờ sau hiện tại.
3. Kiểm tra thư không mở được trước hạn.
4. Sau hạn, xác nhận nhà cung cấp chỉ nhận một yêu cầu gửi thành công và hộp thư chỉ nhận một email. Kiểm tra cả thư rác.
5. Thử hủy thư khác trước giờ gửi và xác nhận không có email được gửi.
6. Thử tài khoản khác, xác nhận không thấy dữ liệu Finance, bản nháp hoặc danh sách Capsule của tài khoản trước.
7. Kiểm tra thư mục Sent/Đã gửi và thông báo thư bị trả lại trong Gmail của tài khoản gửi. KimKim chưa tự đồng bộ thông báo bounce hoặc trạng thái đã đọc.

Trạng thái “Đã gửi” nghĩa là Gmail API đã trả mã thư thành công, không có nghĩa người nhận chắc chắn đã nhận hoặc đọc email.

## Bảo mật và giới hạn

- Chỉ tài khoản đã xác minh email mới niêm phong được thư.
- Niêm phong mã hóa nội dung và ảnh, đồng thời xóa đúng phiên bản bản nháp trong cùng một thao tác cơ sở dữ liệu. Nếu bản nháp bị sửa từ thiết bị khác, yêu cầu bị từ chối để tránh gửi nhầm nội dung.
- Bản nháp chưa được mã hóa bằng khóa Capsule; được bảo vệ bằng quyền tài khoản Firestore. Đây không phải mã hóa đầu cuối.
- Mỗi thư hỗ trợ một người nhận bên ngoài và tối đa ba ảnh JPEG nén.
- API của chủ thư chỉ trả thông tin quản lý, không trả nội dung đã mã hóa hoặc khóa mở thư.
- Liên kết người nhận chứa mã ngẫu nhiên 256 bit. Ai có liên kết đều có thể mở thư sau khi gửi; không chuyển tiếp liên kết nếu muốn giữ riêng tư. Liên kết không xác minh danh tính người nhận.
- Trang mở thư có chính sách chống lưu cache, chống gửi referrer và giới hạn tài nguyên tải ngoài. Nhật ký truy cập ứng dụng che mã mở thư; vẫn cần hạn chế và rà soát nhật ký hạ tầng trước khi mở chính thức.
- Yêu cầu niêm phong lặp dùng cùng mã thư. Gmail API không có khóa chống trùng như Resend. Backend chỉ thực hiện một lần gửi cho mỗi job đã được nhận xử lý; không tự gửi lại job đang gửi hoặc không rõ kết quả.
- Timeout, mất kết nối hoặc lỗi lưu trạng thái sau khi Gmail nhận thư được đánh dấu “Cần kiểm tra kết quả gửi”. Quản trị viên kiểm tra Sent trong Gmail bằng người nhận, tiêu đề và Message-ID trước khi quyết định xử lý thủ công. Message-ID cố định hỗ trợ đối chiếu, không bảo đảm Gmail tự chống trùng. Cơ chế này ưu tiên tránh gửi trùng; có thể bỏ lỡ thư khi tiến trình dừng trước lúc gửi. Không cam kết gửi đúng một lần tuyệt đối.
- Token hết hạn/bị thu hồi hoặc Gmail từ chối quyền gửi sẽ đánh dấu lỗi; không tự gửi lại. Sau khi cấp quyền lại, quản trị viên cần kiểm tra các thư lỗi. Chưa có nút gửi lại tự động.
- Chỉ hủy được thư trước khi bộ chạy lịch bắt đầu xử lý.
- Đổi tài khoản sẽ xóa dữ liệu và hộp thoại đang hiển thị. Finance có nút ẩn số tiền theo phiên; nút này không thay thế phân quyền dữ liệu.
- Bản beta chưa trải qua kiểm toán bảo mật độc lập. Chưa kiểm thử gửi email thật vì chưa hoàn tất cấu hình.

## Kiểm thử dành cho lập trình viên

Backend:

```bash
python -m unittest discover -s tests -p test_capsules.py -v
```

Luồng giao diện: `tests/personal-dom.cjs`, dùng dữ liệu giả trong `tests/fixtures/personal.html`, cần cài jsdom. Các kiểm thử này không gửi email hoặc kết nối Firebase thật.
