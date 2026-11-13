# Files & recordings — đề xuất luồng và giao diện

Đây là đề xuất bố cục, chưa thay giao diện chính của ba màn. Bộ màu giữ nguyên: Dark Rose Dusk Luxe / Light Rose Dusk. Prototype: `/files-workspace-preview.html`; dữ liệu mẫu, không gọi AI, không lưu dữ liệu tài khoản.

## 1. Danh sách nội dung

- Tiêu đề Tệp & bản ghi; nút Thêm nội dung mở ba lựa chọn: Tải tệp / Ghi âm / Mời KimKim vào Meet.
- Một hàng tìm kiếm, bộ lọc định dạng, nguồn và trạng thái. Định dạng và nguồn là hai trường độc lập.
- Desktop: bảng tên, loại, nguồn, ngày thêm, thời lượng hoặc số trang, trạng thái nội dung và trạng thái tóm tắt AI. Mobile: danh sách card với metadata hai dòng; bộ lọc trong sheet.
- Tệp mới lưu source.kind, source.format, source.fileName, source.mimeType. Nguồn gồm upload / recorder / kimkim_meeting / manual. Không suy ra nguồn từ tên hoặc link Meet.
- Tài liệu cũ có document.kind được nhận dạng theo metadata. Bản ghi cũ không giữ tên/định dạng tệp gốc phải hiển thị Chưa rõ; không suy đoán MP3/M4A.

## 2. Chi tiết nội dung

- Header gọn: quay lại danh sách, tên, định dạng, nguồn, ngày, thời lượng/số trang. Edit/Delete gom trong menu; Export là nhóm riêng.
- Ba tab: Tổng quan / Nội dung gốc hoặc Bản chép lời / Hỏi KimKim. Desktop có panel ngữ cảnh; mobile chỉ một tab tại một thời điểm.
- Tổng quan chưa có AI: một trạng thái trống rõ ràng và nút Phân tích nội dung; không dựng ba card rỗng hoặc báo đang xử lý khi chưa có job.
- Sau khi job hoàn tất và được lưu: hiển thị tóm tắt, điểm chính, việc cần làm cùng thời điểm tạo, nguồn nội dung và nút thử lại khi lỗi.
- Tài liệu dùng nội dung trích xuất; chỉ mở/tải tệp gốc khi đã có bản gốc được lưu và có quyền truy cập.
- Người tham gia / điều khiển ghi âm chỉ hiện với nội dung và trạng thái phù hợp. Không hiện nút kết thúc ghi âm trên một file đã tải lên.
- Ghi chú cá nhân là section có thể thu gọn. Thống kê người nói không được gọi là thời gian nói nếu chỉ đếm số đoạn.
- Bỏ dịch sang tiếng Anh hoàn toàn. PowerPoint hiện là xuất mẫu slide cơ bản; PNG là ảnh trình bày tóm tắt; không giới thiệu thành AI thiết kế slide hoặc AI sinh ảnh.

## 3. Chỉnh sửa

- Đổi tên thành Chỉnh sửa thông tin; form tập trung: tên, mô tả, các trường phù hợp với nguồn. Nguồn và định dạng được hệ thống nhận dạng, không tự đoán lại từ tiêu đề đã sửa.
- PDF/audio tải lên không có lời mời Meet hoặc switch tự chạy bot khi lưu.
- Lên lịch / mời bot là hành động riêng trong Calendar hoặc KimKim Recorder; không gắn ngầm vào thao tác sửa metadata.
- Save/Cancel rõ ràng; bảo vệ bản nháp khi quay lại hoặc chuyển trang.

## 4. Trạng thái để mở rộng

Tách ba lớp dữ liệu: `contentStatus` (tiếp nhận/phiên âm/trích xuất/sẵn sàng/lỗi), `analysisStatus` (chưa chạy/đang chạy/đã lưu/lỗi), và `artifacts[]` (PPTX/PNG/mindmap với trạng thái riêng). Mỗi job cần content ID/version, thời điểm chạy, lỗi và retry. Không lấy việc có route API làm bằng chứng tính năng đã chạy được. Chỉ báo thành công sau khi có kết quả thật và đã lưu.

Việc giữ được dữ liệu khi createMeeting là sửa lỗi lưu trữ; nó không khôi phục các kết quả cũ đã mất và không chứng minh nhà cung cấp AI đang hoạt động. Cần kiểm thử từng luồng bằng dữ liệu thử có quyền sử dụng trước khi công bố khả dụng.
