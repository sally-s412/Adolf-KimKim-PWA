# Giao diện Sally Space cho ADOLF KIMKIM

## Phạm vi

- Menu Lịch dùng cùng kiểu điều hướng với các mục khác; bỏ nền và viền mặc định của button. Vẫn giữ focus ring khi dùng bàn phím.
- Messenger bỏ thông điệp nhắc chia sẻ thông tin nhạy cảm. Thông báo mất mạng hoặc không được phép gửi vẫn hiển thị đúng trạng thái.
- KimKim nhấp nhô 7 px theo chu kỳ 3,4 giây liên tục. Hiệu ứng rung hiện có nằm trên button, hiệu ứng nhấp nhô nằm trên ảnh để hai hiệu ứng không ghi đè nhau. Tắt chuyển động khi người dùng bật Reduce Motion.
- Social dùng feed tối đa 470 px, story rail và cột người quen. Highlights chỉ hiển thị trên trang cá nhân của đúng chủ sở hữu, dưới thông tin và thao tác hồ sơ. Nội dung và ảnh vẫn lấy từ dữ liệu bạn bè hiện có; không tạo like/comment/follow giả để lấp UI.
- Messenger dùng ba cột từ 1280 px, hai cột ở tablet và một màn danh sách/cuộc trò chuyện trên mobile. Cột chi tiết mở hồ sơ/nhóm, đổi theme và xem tối đa sáu ảnh đã tải trong cuộc trò chuyện.
- Calendar có lưới tháng và lịch trình ngày cạnh nhau trên desktop, xếp dọc trên mobile. Số hàng tuần khớp với tháng. Chức năng CRUD, xuất .ics, gắn link Meet và mời KimKim được giữ nguyên.
- Áp dụng nền gradient 3.0 cho dark, 3.1 cho light, có lớp màu cân bằng và bề mặt dịu hơn. Màu nhấn người dùng đã chọn vẫn có hiệu lực. Theme chung của từng chat được giữ riêng.

## Nguồn thiết kế

Sally Space: file `85UJNYruf8BwPSMBL0hhfq`, trang `218:150`; SNS desktop `253:5169`, Mess desktop `252:4804`, Calendar desktop `240:2598`. Giữ branding ADOLF KIMKIM và các luồng dữ liệu thật.

Gradient: file `5aklpO7th5gP11u1rlsJi2`, dark `0:81`, light `0:96`. SVG gốc được xuất từ nhóm `0:82` và `0:97` vì URL asset tạm trả trang Site Unavailable. Lưu nội bộ tại assets/atmosphere; không dùng ảnh chụp màn hình làm background. Các icon Sally được xuất trực tiếp và lưu tại assets/sally. Nền không chứa lớp noise bitmap của file tham khảo.

## Kiểm chứng

48 kiểm thử JavaScript pass, gồm Calendar, chat, trạng thái Sent/Seen, theme, social publishing, ảnh đại diện/bìa, upload, transcript, AI contract và PWA. Kiểm tra trực quan bằng trình duyệt với dữ liệu mẫu riêng ở viewport desktop 1363 px và mobile 390 × 844 px. Dữ liệu mẫu không nằm trong bản deploy. Chưa thực hiện gửi tin/ảnh thật hoặc tạo lịch trên tài khoản production.

Không đổi Firebase Rules, AI models, keys, prompts hoặc endpoints. Chỉ cập nhật nhánh ui/refine-notes-settings-chat; không đổi main.
