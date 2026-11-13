# Bật lịch gửi KimKim Capsule miễn phí

## Trạng thái

Backend có sẵn API nhận lịch và chế độ kiểm tra không gửi thư. Bạn cần tự đăng nhập hoặc tạo tài khoản cron-job.org, vì chưa có phiên đăng nhập vào tài khoản của bạn. Chưa có job nào được tạo hoặc bật bởi bản cập nhật này. Không tạo Render Cron Job trả phí.

## 1. Tạo lịch kiểm tra trước

Mở https://console.cron-job.org/login và đăng nhập. Nếu chưa có tài khoản, chọn Sign up và xác minh email.

Chọn tạo cronjob mới, điền:

| Mục | Giá trị |
| --- | --- |
| Tên | KimKim Capsule |
| URL kiểm tra | `https://adolf-kimkim-beta.onrender.com/api/capsules/dispatch?dry_run=true` |
| Lịch | Mỗi phút — Every minute |
| HTTP method | POST |
| Header name | `X-Capsule-Secret` |
| Header value | Copy đúng giá trị `CAPSULE_DISPATCH_SECRET` từ backend Render |
| Request body | Để trống |
| HTTP Basic Authentication | Không bật; đã xác thực bằng header riêng |

Trong bước này, để job chưa tự chạy nếu giao diện cho phép. Giữ `CAPSULE_SCHEDULER_ENABLED=false` trên Render. Chỉ dùng Test run/Run now để kiểm tra. Không đặt secret vào URL.

Cron-job.org chỉ cần biết URL và dispatch secret. Không nhập khóa Gmail, khóa mã hóa, JSON Firebase hoặc nội dung Capsule vào dịch vụ này. Dispatch secret cho phép gọi xử lý thư tới hạn, nên bảo vệ tài khoản cron-job.org và không công khai cấu hình job.

## 2. Kiểm tra kết nối

Chạy thử job, xem lịch sử HTTP response. Kết quả thành công có dạng:

```json
{"ready":true,"dryRun":true,"sent":0,"schedulerEnabled":false}
```

Chế độ này kiểm tra giải mã/cấp mới token Google và truy vấn Firestore/chỉ mục. Không gửi thư, không nhận xử lý job và không kiểm tra thư đã tới hộp thư. `ready:true` ở đây chưa bảo đảm Gmail API đã bật hoặc email sẽ được nhận.

| Lỗi | Cách xử lý |
| --- | --- |
| `401 capsule/invalid-scheduler` | Header thiếu hoặc sai giá trị. Copy đúng dispatch secret, không thêm dấu ngoặc kép hoặc khoảng trắng. |
| `503 capsule/not-configured` | Thiếu/sai biến backend, khóa không giải mã được token, token không có đúng quyền gmail.send, hoặc JSON Firebase không hợp lệ. |
| `503 capsule/gmail-authorization-required` | Gmail token hết hạn, bị thu hồi hoặc thông tin OAuth sai; cấp quyền lại và nhập token mã hóa mới. |
| `503 capsule/storage-unavailable` | Kiểm tra Firestore quyền tài khoản dịch vụ và chỉ mục. Không mở quyền dữ liệu công khai. |
| Timeout | Backend Render miễn phí có thể đang ngủ. Mở app để đánh thức, chờ rồi thử lại. Đừng bật lịch thật nếu kiểm tra chưa qua. |

## 3. Chuyển sang gửi thật

Sau khi kiểm tra qua:

1. Đổi URL cronjob sang `https://adolf-kimkim-beta.onrender.com/api/capsules/dispatch` — bỏ toàn bộ `?dry_run=true`.
2. Giữ POST, header và lịch mỗi phút, rồi bật job. Bật thông báo lỗi/thông báo job bị tự tắt nếu có. Tắt lưu response lâu dài nếu không cần.
3. Trên backend Render đặt `CAPSULE_SCHEDULER_ENABLED=true`, Save và Deploy. Trước khi bản deploy mới Live, job có thể báo scheduler-disabled; đây là chặn an toàn.
4. Chạy thử và kiểm tra HTTP 200 với `failed:0` và `deliveryUnknown:0`. `sent:0` bình thường nếu chưa có thư tới hạn.
5. Trong KimKim, dùng tài khoản đã xác minh email, tạo một thư gửi tới email của chính bạn, hẹn sau 5–10 phút.
6. Kiểm tra đúng một email trong Gmail Sent và hộp thư nhận, rồi mở link xem nội dung. Thử hủy một thư khác trước hạn để xác nhận không gửi.

Gửi thật thành công chỉ được xác nhận sau khi nhận được email; không dựa riêng vào việc Render Live hoặc HTTP 200. Nếu `failed` hay `deliveryUnknown` lớn hơn 0, kiểm tra thư lỗi trong KimKim và Gmail Sent. HTTP 200 có nghĩa lượt quét hoàn tất, không có nghĩa tất cả thư đã được nhận.

## Giới hạn và an toàn

- Dịch vụ cron-job.org công bố miễn phí và lịch tối thiểu mỗi phút; không bảo đảm đúng từng giây. FAQ: https://cron-job.org/en/faq/
- FAQ hiện nêu giới hạn chờ 30 giây. Một lượt quét có nhiều thư hoặc backend khởi động chậm có thể timeout. Không bật cơ chế tự gửi lại thư từ ngoài; backend đã dùng quyền nhận xử lý để tránh hai lượt cron gửi cùng thư. Cần xem trạng thái từng thư khi timeout.
- Backend Render miễn phí có thể ngủ/khởi động lại. Đây là cấu hình beta, không có cam kết thời gian giao thư.
- OAuth Gmail ở chế độ Testing có thể hết hạn sau 7 ngày; cần xử lý trạng thái phát hành trước khi nhận thư hẹn dài hạn.
- Không công khai ảnh cấu hình chứa header secret. Không gửi các khóa qua chat.
- Muốn tạm dừng: tắt job và đặt `CAPSULE_SCHEDULER_ENABLED=false` trên backend rồi deploy. Thư đã được nhận xử lý có thể vẫn hoàn tất; không phải thao tác thu hồi email đã gửi.
