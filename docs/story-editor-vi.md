# Story editor và story trong profile

- Avatar profile có vòng story khi chủ trang có story còn trong 24 giờ và người xem đủ quyền. Nhấn avatar để xem chuỗi story của người đó. Feed gom nhiều story của một người vào một vòng.
- Editor 9:16: ảnh từ thiết bị, Fit/Fill, năm nền gradient, chữ (màu/cỡ/font/nền, sửa lại), vẽ (màu/độ dày), tag bạn bè, nhãn địa điểm, GIF và nhạc từ thiết bị. Kéo để di chuyển, đổi kích thước/xoay lớp, xóa lớp, hoàn tác. Tối đa 12 lớp và 3 GIF.
- GIF giữ chuyển động, tối đa 500 KB/GIF, 120 khung hình và 25 triệu pixel tổng. Không tích hợp tìm kiếm GIPHY.
- Nhạc từ file thiết bị dưới 15 MB, nguồn dưới 10 phút; chọn đoạn tối đa 15 giây. Client xuất WAV mono 22050 Hz. Người xem bật nhạc bằng nút âm thanh; trình duyệt có thể không cho tự phát.
- Địa điểm do người đăng nhập tên; người xem bấm để mở tìm kiếm Maps. Không xin GPS. Tag bấm để mở hồ sơ; chưa gửi thông báo riêng cho người được tag.
- Viewer có thanh tiến trình, trước/tiếp, tạm dừng, nhạc, lưu/bỏ highlight của chính mình; dừng âm thanh khi đóng/ẩn trang.

## Lưu và quyền

Giữ nguyên cấu trúc Firestore V5: tạo story unpublished, upload rồi publish. `/api/story-media` dùng token của người gọi đọc Firestore để xác nhận quyền; POST chỉ chủ draft story, GET theo quyền bạn bè hiện có. Poster JPEG dùng Cloudinary image/authenticated; manifest JSON chứa GIF, đoạn WAV và vùng bấm dùng raw/authenticated. URL có chữ ký chỉ dùng trên backend, không gửi tới browser. Không cần thêm Firebase Rules hoặc API key mới. Nếu hiệu ứng chưa tải được, vẫn hiện poster và thông báo thử lại.

Các tài nguyên chưa hoàn tất/xóa bài có thể còn trong Cloudinary và cần dọn theo quy trình media beta hiện tại. Story hết hạn được ẩn trên giao diện; không phải TTL tự xóa dữ liệu server. Highlights giữ lại trên profile.

## Design và kiểm tra

Đọc UI Kit Instagram file PAigJq7Py0D9lN55asWhYC, trang Screens 1:3483, Story Dark 1029:20262; toolbar assets xuất từ các node gốc, giữ 24px. Link Community 1017925684341254840 không đọc được trong phiên này, không dùng làm nguồn đã xác nhận. Giữ branding KimKim, không dùng ảnh mẫu/nhân vật của Instagram.

49 kiểm thử JavaScript và 7 kiểm thử Python pass. Browser QA cục bộ trên mobile 390×844: mở editor, tạo chữ/tag, xuất poster+hotspot qua mock API, mở profile và xem story từ avatar. Không publish nội dung thử lên production. Luồng Cloudinary raw/audio/GIF bằng tài khoản thật chưa kiểm chứng end-to-end. Không đổi model/key/prompt/endpoint AI; chỉ nhánh UI.
