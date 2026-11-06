# Social + Calendar V4 — ADOLF KIMKIM

Nhánh: `ui/refine-notes-settings-chat`. Không sửa main, model, prompt, AI key hoặc đường xử lý AI. Backend chỉ thêm router ảnh chat; không thêm dịch vụ trả phí.

## Đã triển khai

| Phần | Hành vi |
| --- | --- |
| Hồ sơ | Bìa tỷ lệ 16:7, cao hơn; 18 mẫu gradient/đồ họa có sẵn; chọn giữ trọn ảnh không cắt hoặc phóng/cắt; tải avatar ngay trên hồ sơ |
| Avatar | Lưu lựa chọn riêng trong users và hồ sơ social đã tạo; khôi phục ảnh riêng nếu Google cập nhật lại photoURL ở lần đăng nhập sau |
| Messenger | Chat chữ/ảnh; tiến trình gửi, retry bằng một ID; Đã gửi sau server ack; Đã xem chỉ khi có receipt của người nhận; typing tự hết hạn 7 giây |
| Theme | 6 chủ đề, lưu trên document cuộc trò chuyện và cập nhật realtime cho người tham gia |
| Nhóm chat | Tạo với 2–3 bạn bè, tổng tối đa 4 người trong beta; chỉ thành viên đọc/gửi; không thay đổi thành viên qua client |
| Thông báo | Chuông trong app: lời mời đến, lời mời được chấp nhận, tin nhắn mới; click mở đúng hồ sơ/chat; trạng thái đã đọc lưu theo user |
| Menu | Bỏ mục Nhóm cũ; nhóm trò chuyện nằm trong Messenger; thêm Social và Lịch |
| Calendar | Tháng/tuần/ngày, tạo/sửa/xóa, 6 màu, giờ thiết bị, Google Meet URL, xuất .ics; sự kiện riêng trong users/{uid}/calendarEvents |
| Meeting | Từ lịch mở Google Meet hoặc điền tên/link sang Recording để mời KimKim; từ thẻ Meet có nút lên lịch |
| Social UI | Bảng tin, tạo bài, story 9:16, thêm/bỏ highlight, tab bài đăng trong hồ sơ; **bản nháp trong bộ nhớ phiên, chưa publish cho người khác** |

Ảnh bìa cũ đã được cắt vào file upload trước đây không thể khôi phục phần mất: cần tải lại ảnh gốc và chọn “Giữ trọn ảnh”. Các mẫu bìa hệ thống không cần Cloudinary và không tốn lượt upload.

## Một lần cập nhật Firebase

1. Firebase Console → Firestore Database → Rules.
2. Nếu hiện tại dùng đúng bản V3 do repo cung cấp, sao chép toàn bộ `firebase/firestore-community-v4.rules`, thay Rules và Publish. Nếu đã thêm rules riêng khác, merge chúng trước.
3. Giữ `communityConfig/release.enabled = true`, `version = 1` (int64), `mediaCloudName` (string) bằng Cloud name đang dùng. **Không đổi version thành 4.**
4. Tải lại web. V3 vẫn cho chat chữ cũ nhưng không đủ quyền tạo nhóm, typing, đổi theme và notification state mới.

Cloudinary dùng lại ba biến backend đã chuẩn bị: PROFILE_MEDIA_CLOUD_NAME, PROFILE_MEDIA_API_KEY, PROFILE_MEDIA_API_SECRET. Không đưa secret lên Static Site/GitHub/chat. Hướng dẫn đăng ký/cấu hình trong `docs/profile-media-beta-vi.md`.

## Ảnh chat riêng tư

Ảnh được upload với Cloudinary delivery type `authenticated`. Frontend chỉ lưu `mediaId` gắn thread/sender/message, không lưu URL công khai. Khi xem, backend xác minh Firebase token và đọc Firestore bằng token của chính user để xác nhận thành viên; proxy trả JPEG với `Cache-Control: private, no-store`. URL ký của Cloudinary không trả về trình duyệt. Blob URL bị thu hồi khi đổi chat/đăng xuất. Chưa phải mã hóa đầu cuối; người nhận vẫn có thể lưu/chụp nội dung được phép xem.

Backend hiện có trên Render Free có thể cold-start; ảnh chat cần backend đó và Cloudinary hoạt động. Rate guard upload dùng chung 1 lần/10 giây/user, thêm giới hạn beta API hiện có. Đây không phải quota chi phí bền vững; ảnh upload thất bại ở bước lưu tin có thể thành asset chưa tham chiếu, cần dọn thủ công trong beta. Chưa có công cụ xóa ảnh/chat, thêm/xóa thành viên nhóm hoặc giải tán nhóm.

## Giới hạn rõ ràng

- Thông báo **trong app khi đang mở**, chưa có push nền/email/thông báo hệ điều hành. Hiển thị tối đa sự kiện mới nhất theo connection/thread, không phải log tất cả tin nhắn. “Đánh dấu đã đọc” đồng bộ giữa thiết bị.
- Typing là tín hiệu ngắn hạn, không phải online/last-seen. Chỉ ghi khi người dùng nhập, throttle 3 giây; sẽ tự hết sau 7 giây nếu tab mất kết nối.
- Nhóm chat không yêu cầu mọi thành viên đã là bạn của nhau; người tạo chỉ thêm bạn bè của mình. Block giữa bất kỳ người gửi và thành viên nào sẽ chặn gửi tiếp theo.
- Calendar dùng múi giờ thiết bị; đọc tối đa 200 sự kiện gần nhất theo start giảm dần trong beta. Chưa có lặp lịch, lịch chia sẻ, nhắc việc, tự tạo link Meet, OAuth/sync hai chiều Google Calendar hoặc bot tự vào đúng giờ. Khung giờ tuần/ngày hiển thị sự kiện theo giờ bắt đầu; agenda hiển thị cả sự kiện qua ngày.
- Lưu lịch hoặc xuất .ics không gửi thư mời cho ai. “Mời KimKim” chỉ điền dữ liệu sang màn Recording; người dùng bấm nút mời, worker Meet vẫn phải hoạt động.
- Bài đăng/story/highlight hiện là **UI preview**; bản nháp mất khi đăng xuất/tải lại trang. Không có like/comment/viewer count giả, không phát hành dữ liệu xã hội khi chưa xây quyền, lưu trữ và moderation.
- Figma có bộ màn mới Social V4 và Calendar V4: desktop/tablet/mobile × dark/light × VI/EN. Nội dung tên/ngày là mẫu thiết kế; app dùng dữ liệu tài khoản thật. Web tiếp tục font system/Segoe theo yêu cầu trước đó.

## Kiểm thử trước deploy

- JS regression/PWA/UI, Calendar validation và ICS, sent/seen và theme selector.
- Firestore Emulator: quyền nhóm 3 và 4 người, thành viên, block, spoofing typing/read receipts/media paths, private calendar, rules cũ.
- Python: auth, ảnh hồ sơ, non-member denied, private media proxy, media path spoofing.
- Trình duyệt fixture: desktop/mobile, hồ sơ/thư viện, Messenger, Calendar và Social preview. Không phải kiểm thử đăng nhập hai tài khoản production hoặc upload ảnh thật qua Cloudinary.
