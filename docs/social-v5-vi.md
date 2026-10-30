# Social V5

- KimKim lớn hơn trên tất cả màn, rung nhẹ theo chu kỳ 9 giây, tắt khi hệ thống chọn giảm chuyển động. Khung Messenger dùng kích thước nhỏ hơn màn thường để tránh che composer.
- Chuông SVG trên header, badge số thông báo chưa đọc; không hiện số 0. Đây là thông báo trong app, chưa có push nền.
- Settings → Tài khoản → Giao diện: chọn màu nhấn, khôi phục mặc định. Lưu trên trình duyệt đang dùng, không đổi theme chung của cuộc trò chuyện.
- Social chuyển từ preview thành bài đăng/story/highlight thật. Lưu Firestore tại communityProfiles/{author}/posts; chỉ chủ sở hữu và bạn bè accepted, không block, được đọc nội dung đã publish. Bản đang upload chỉ chủ sở hữu đọc được. Ảnh Cloudinary authenticated, proxy backend xác nhận quyền qua Firestore token của chính người xem; không lưu URL ảnh công khai.
- Feed beta đọc tối đa 20 nội dung đã publish/mỗi người trong 50 kết nối hiện có; sắp xếp trong client. Story ẩn khỏi giao diện sau 24 giờ, highlight giữ lại. Thời hạn story là hiển thị, chưa tự xóa dữ liệu server. Có thể xóa nội dung của chính mình. Chưa có likes, bình luận hoặc danh sách xem story.
- Bắt buộc Publish **firebase/firestore-community-v5.rules**, giữ communityConfig/release.version = 1; giữ mediaCloudName và ba biến Cloudinary backend đang dùng. V5 bảo toàn rules users và các quyền chat V4; nếu có rules riêng khác cần merge trước.
- Calendar hiện gắn link Meet và handoff mời KimKim. Đồng bộ Google Calendar hoặc tạo link Google Meet tự động cần OAuth riêng cho từng người dùng và Calendar API; Firebase Google Sign-in không thay thế cấp quyền Calendar. Không thay AI keys/models. Chưa bật đồng bộ Google hoặc bot tự vào giờ hẹn.
- Giới hạn beta: upload 2 MB sau nén, 1 lần/10 giây/user; Render Free có cold start; ảnh chưa gắn do upload/save thất bại cần dọn trong Cloudinary. Chưa xác minh end-to-end ảnh production bằng hai tài khoản thật. Kiểm thử Rules bằng emulator bao gồm stranger, draft, friendship, block và giả mạo owner.
