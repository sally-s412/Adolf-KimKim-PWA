# KimKim Meeting: tài khoản Google riêng

## Trạng thái hiện tại

Nút Mời KimKim gọi worker để mở Meet và ghi âm. Tạo tài khoản Google
không tự tạo lịch chạy bot. Tự tham gia theo lịch Calendar cần một luồng
đồng bộ lịch, chọn cuộc họp và lập lịch riêng; bản thay đổi này chưa thêm luồng đó.

Lỗi `Target page, context or browser has been closed` là trình duyệt worker
đã đóng, không chứng minh tài khoản Google bị từ chối. Cần kiểm tra tài nguyên,
tiến trình trình duyệt và log worker trước khi kết luận về quyền vào phòng.

## Cấu hình trên máy của AI engineer

Giữ CDN frontend và API AI hiện tại. Có thể chạy riêng capture worker trên máy
Linux đang có sẵn, với đủ RAM cho Chromium và thư mục dữ liệu bền vững.
Không thay model, prompt, key hoặc pipeline phiên âm/tóm tắt.

1. Tạo một tài khoản Google dành cho KimKim, đặt tên hiển thị KimKim Meeting.
2. Trên chính máy Linux sẽ chạy worker, đăng nhập thủ công tài khoản đó bằng
   trình duyệt Patchright với một thư mục hồ sơ riêng. Người vận hành tự nhập
   thông tin và hoàn thành xác thực của Google. Ví dụ trong phiên desktop:

   ```sh
   python -m patchright codegen --user-data-dir=/srv/kimkim/google-profile https://accounts.google.com/
   ```

   Không dùng thư mục hồ sơ Chrome cá nhân mặc định. Sau khi đăng nhập, đóng
   trình duyệt chuẩn bị hồ sơ trước khi chạy worker; không dùng đồng thời hai
   tiến trình với cùng thư mục. Việc đăng nhập có thể bị Google hạn chế và phải
   được xác minh thực tế; không có cơ chế bỏ qua xác thực trong ứng dụng.

3. Cấp quyền đọc/ghi thư mục đó cho user chạy worker. Đặt biến môi trường
   **chỉ ở capture worker**, không ở frontend:

   ```sh
   MEET_GOOGLE_PROFILE_DIR=/srv/kimkim/google-profile
   ```

   Adapter sẽ dùng thư mục đã tồn tại. Biến trống giữ hành vi cũ. Cấu hình
   này không chứng nhận phiên Google còn hiệu lực; engineer cần mở Meet và
   kiểm tra đúng tài khoản trên cùng máy. Khi Google yêu cầu đăng nhập lại,
   dừng worker và đăng nhập lại thủ công vào cùng hồ sơ.

4. Chạy capture worker từ repo, giữ nguyên các dependency PulseAudio,
   FFmpeg, Xvfb và Patchright trong `Dockerfile.meeting`. Nếu dùng Docker,
   mount thư mục hồ sơ thành volume tại đường dẫn trên, có quyền ghi cho
   user `kimkim`; không đưa hồ sơ/cookies/mật khẩu vào image hoặc Git.
   Endpoint worker phải dùng HTTPS và truy cập được từ API hiện tại.
5. Chuyển **MEET_WORKER_URL** ở API sang URL capture worker này. Không đổi
   `SPEECH_SERVICE_URL`, khóa AI hay URL API của CDN khi chỉ chuyển capture.
   Worker giữ xác thực Firebase và chỉ cho chủ phiên truy cập âm thanh.
6. Mời email KimKim vào sự kiện Calendar và cấu hình quyền vào phòng của
   chủ cuộc họp. Dùng đúng tài khoản được mời không bảo đảm mọi phòng đều
   cho vào thẳng; chính sách Workspace, phòng chờ và yêu cầu host có mặt
   vẫn áp dụng. Sau đó thử nút Mời KimKim, kiểm tra trong danh sách người
   tham gia, thử ghi âm ngắn và kiểm tra phiên âm/tóm tắt bằng pipeline cũ.

## Vì sao không lưu tài khoản lâu dài trên Render Free hiện tại

Render Free không có persistent disk và dữ liệu filesystem mất khi restart,
redeploy hoặc spin down. Một lần đăng nhập vào thư mục cục bộ trên instance
không tạo cấu hình tài khoản bền vững. Không nhúng phiên đăng nhập trong repo
để xử lý vấn đề này. Dùng máy sẵn có của engineer với volume riêng là phương án
không phát sinh gói Render trả phí; cần máy đó hoạt động khi bot chạy.

## Kiểm tra trước khi thông báo đã hoạt động

- Đăng nhập đúng tài khoản trên chính worker; thử vào một phòng được phép.
- Xác nhận tiến trình Chromium sống qua giai đoạn lobby/chờ duyệt.
- Xác nhận host thấy KimKim, audio WAV có dữ liệu, transcript và summary có kết quả.
- Kiểm tra lại phiên đăng nhập sau restart worker có giữ được không.

Nguồn: https://playwright.dev/python/docs/api/class-browsertype#browser-type-launch-persistent-context
https://support.google.com/a/users/answer/11989526
https://render.com/docs/free
