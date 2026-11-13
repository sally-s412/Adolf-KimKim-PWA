# Thông báo tin nhắn KimKim

## Đã có trong mã nguồn

- Nút **Bật thông báo** trong màn Tin nhắn. Người dùng tự cấp quyền; mỗi thiết bị có token riêng.
- Khi trang vẫn đang chạy (kể cả chuyển sang tab khác): tiếng chuông ngắn sau khi người dùng đã tương tác với trang. Tab đang hiển thị nhưng không được chọn có thêm thông báo hệ thống. Khi trang chạy nền hoặc đã đóng: push hệ thống qua service worker.
- Khi đóng trang/PWA: Cloud Function nhận tin nhắn mới từ Firestore và gửi FCM đến thiết bị đã đăng ký. Nội dung push chỉ báo có tin mới, không đưa lời thoại riêng tư vào payload.
- Đăng xuất hoặc tắt thông báo sẽ xóa token thiết bị. Token cũ bị FCM từ chối sẽ được dọn trên server.

## Cần cấu hình và triển khai Firebase

1. Vào **Firebase Console → Project settings → Cloud Messaging → Web configuration**. Tạo **Web Push certificate** và sao chép **public VAPID key**. Đây là khóa công khai; không đưa private key vào frontend.
2. Trong Firestore tạo document `communityConfig/push` với trường `vapidKey` (string) là khóa công khai ở bước 1.
3. Triển khai rules mới trong `firebase/firestore-community-v6.rules` **sau khi đối chiếu với rules đang chạy**. Rules bổ sung chỉ cho chủ tài khoản ghi/xóa token của mình, không cho client đọc danh sách token.
4. Cần dự án Firebase bật gói hỗ trợ Cloud Functions. Cấu hình CLI đã có ở `firebase.json`. Tại thư mục repo: `cd functions && npm install && cd ..`, đăng nhập Firebase CLI bằng tài khoản có quyền rồi chạy `firebase deploy --only functions:message-push --project adolfkimkim`. Không triển khai function từ tài khoản cá nhân không có quyền trên dự án.
5. Thử bằng **hai tài khoản khác nhau trên hai thiết bị/trình duyệt**: bật quyền ở bên nhận, gửi tin khi tab đang mở, khi tab ở nền, và sau khi đóng tab. Kiểm tra âm thanh, liên kết mở đúng cuộc trò chuyện, tắt thông báo/đăng xuất, tài khoản bị chặn, và không gửi thông báo về chính người gửi.

Để deploy chức năng này cần quyền quản trị Firebase cho rules, Cloud Messaging và Cloud Functions. Deploy riêng website Render chỉ đưa nút và service worker lên, **chưa thể gửi push nền** nếu chưa hoàn tất các bước Firebase. Khi chưa có `vapidKey`, nút sẽ báo cấu hình chưa sẵn sàng.

Âm thanh tùy chỉnh có thể phát khi trang còn chạy, kể cả tab ở nền, nếu trình duyệt không tạm ngưng trang và AudioContext đã được mở sau tương tác. Khi app đã đóng, tiếng thông báo hệ thống phụ thuộc cài đặt thông báo/âm lượng của thiết bị; web không thể ép phát một file âm thanh tùy ý. iPhone/iPad yêu cầu thêm PWA vào Màn hình chính để nhận Web Push.
