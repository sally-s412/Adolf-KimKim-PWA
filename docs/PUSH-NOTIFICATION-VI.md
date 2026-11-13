# Thông báo tin nhắn KimKim

## Đã có trong mã nguồn

- Màn **Cài đặt → Thông báo** (cũng mở từ màn Tin nhắn) có công tắc push, công tắc **Âm thanh trong app** và nút nghe thử. Người dùng tự cấp quyền; mỗi thiết bị có token riêng. Âm thanh trong app lưu riêng theo tài khoản trên thiết bị này.
- Khi trang vẫn đang chạy (kể cả chuyển sang tab khác): tiếng chuông ngắn sau khi người dùng đã tương tác với trang. Tab đang hiển thị nhưng không được chọn có thêm thông báo hệ thống. Khi trang chạy nền hoặc đã đóng: push hệ thống qua service worker.
- Khi người gửi lưu tin nhắn thành công: frontend báo backend Render. Backend xác minh Firebase ID token, kiểm tra bản ghi thật trong Firestore rồi gửi FCM đến thiết bị đã đăng ký. Người nhận vẫn có thể nhận push khi đóng app. Nội dung push chỉ báo có tin mới, không đưa lời thoại riêng tư vào payload.
- Đăng xuất hoặc tắt thông báo sẽ xóa token thiết bị. Token cũ bị FCM từ chối sẽ được dọn trên server.

## Cần cấu hình và triển khai Firebase

1. Vào **Firebase Console → Project settings → Cloud Messaging → Web configuration**. Tạo **Web Push certificate** và sao chép **public VAPID key**. Đây là khóa công khai; không đưa private key vào frontend.
2. Trong Firestore tạo document `communityConfig/push` với trường `vapidKey` (string) là khóa công khai ở bước 1.
3. Triển khai rules mới trong `firebase/firestore-community-v6.rules` **sau khi đối chiếu với rules đang chạy**. Rules bổ sung chỉ cho chủ tài khoản ghi/xóa token của mình, không cho client đọc danh sách token.
4. Không cần nâng cấp Firebase Blaze hay triển khai Cloud Functions. Backend Render cần service account JSON của đúng Firebase project ở biến môi trường `PUSH_FIREBASE_SERVICE_ACCOUNT_JSON`. Nếu backend đã cấu hình `CAPSULE_FIREBASE_SERVICE_ACCOUNT_JSON` cho Time Capsule thì có thể dùng lại biến đó, không cần thêm biến mới. Service account phải có quyền đọc/ghi Firestore và gửi FCM. Lưu JSON **chỉ trong Render backend Environment**, không lưu trong repo hoặc frontend. Kiểm tra **Firebase Console → Cloud Messaging → Cloud Messaging API (V1)** đã bật. Deploy lại backend Render theo nhánh repo mới; website và API hiện cùng origin.
5. Thử bằng **hai tài khoản khác nhau trên hai thiết bị/trình duyệt**: bật quyền ở bên nhận, gửi tin khi tab đang mở, khi tab ở nền, và sau khi đóng tab. Kiểm tra âm thanh, liên kết mở đúng cuộc trò chuyện, tắt thông báo/đăng xuất, tài khoản bị chặn, và không gửi thông báo về chính người gửi.

Không cần bật Blaze cho cách này. Render chỉ gửi push sau khi frontend gọi `/api/message-push/notify` từ một tin nhắn đã lưu. Nếu người gửi mất mạng hoặc đóng tab ngay sau khi lưu tin nhưng trước khi gọi API thành công, lần đó có thể không gửi push; bản thân tin nhắn vẫn đã được lưu. Backend dùng marker Firestore để không gửi trùng khi người gửi thử lại. Nếu thiếu VAPID key, công tắc push sẽ báo cấu hình chưa sẵn sàng.

Âm thanh tùy chỉnh có thể phát khi trang còn chạy, kể cả tab ở nền, nếu trình duyệt không tạm ngưng trang và AudioContext đã được mở sau tương tác. Khi app đã đóng, tiếng thông báo hệ thống phụ thuộc cài đặt thông báo/âm lượng của thiết bị; web không thể ép phát một file âm thanh tùy ý. iPhone/iPad yêu cầu thêm PWA vào Màn hình chính để nhận Web Push.
