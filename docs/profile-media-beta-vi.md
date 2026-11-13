# Ảnh hồ sơ beta — Cloudinary + Firebase

Đã chuẩn bị code cho avatar và ảnh bìa từ thiết bị. Chưa kích hoạt dịch vụ bên ngoài và chưa xác nhận upload thật vì chưa có tài khoản Cloudinary của chủ ứng dụng.

## Phương án

- Firebase Auth, Firestore: giữ đăng nhập, hồ sơ, kết bạn, chat chữ hiện có.
- Cloudinary Free: ảnh avatar/bìa công khai; không bật Blaze Firebase.
- Backend Render hiện có: xác minh Firebase ID token, nhận ảnh, kiểm tra nội dung, ký request Cloudinary. Không thêm máy chủ mới.
- Không thay model, key, prompt, output hoặc cấu hình AI.
- Theo tài liệu Cloudinary tại 30/10/2026: Free không yêu cầu thẻ, 25 credits dùng chung cho lưu trữ, biến đổi và băng thông; không phải 25 GB cho từng loại. Kiểm tra Usage khi beta tăng người dùng. https://cloudinary.com/pricing ; https://cloudinary.com/documentation/billing_and_plans

## Bạn cần thực hiện một lần

1. Mở https://cloudinary.com/users/register_free — đăng ký Free bằng tài khoản bạn muốn sở hữu lâu dài. Không cần trùng email Firebase.
2. Trong Cloudinary Console → Settings → API Keys, lấy **Cloud name**, **API key**, **API secret**. Không gửi API secret trong chat, không lưu lên GitHub, Figma, frontend.
3. Mở backend hiện có: https://dashboard.render.com/web/srv-dbh5o06c6qcc73fv34r0 → Environment. Thêm đúng ba biến mới, giữ nguyên mọi biến AI:

| Key | Value |
| --- | --- |
| PROFILE_MEDIA_CLOUD_NAME | Cloud name |
| PROFILE_MEDIA_API_KEY | API key |
| PROFILE_MEDIA_API_SECRET | API secret |

4. Save, rebuild/redeploy backend. Không thêm các biến này vào Static Site. Không cần unsigned upload preset.
5. Firebase Console → Firestore → Data → `communityConfig/release`, thêm field **mediaCloudName**, type **string**, value bằng Cloud name. Giữ `enabled=true`, `version=1` (int64).
6. Firestore → Rules: dùng toàn bộ `firebase/firestore-community-v3.rules`, Publish. File này bảo toàn rules `/users` ban đầu bạn đã gửi. Nếu đã có rules khác ngoài bộ đó, cần merge trước, không ghi đè mất chúng.
7. Mở lại web → làm mới → upload avatar rồi cover, kiểm tra đổi tài khoản không sửa được ảnh người khác. Kiểm tra hồ sơ người khác xem được ảnh.

## Hành vi / giới hạn

- Avatar đầu vào JPG/PNG/WebP ≤5 MB, nén 512 px; bìa crop 1600×480 JPEG. Backend nhận tối đa 2 MB, giải mã lại và loại metadata.
- Upload có tiến độ và hủy cho bìa; transfer phía trình duyệt giới hạn 45 giây. Lấy token và lưu Firestore không nằm trong timeout transfer.
- Upload qua backend có thể phải chờ Render Free thức dậy. Giao diện CDN vẫn mở ngay. Không có cam kết server miễn phí luôn sẵn sàng.
- Một public ID cho mỗi avatar/bìa/user, overwrite có version URL mới. Không backup qua request; cần tắt auto-backup trong tài khoản nếu muốn hạn chế dung lượng lịch sử. Nếu upload xong nhưng lưu metadata lỗi, không xóa asset ghi đè vì có thể xóa ảnh đang được dùng; thử lại sẽ thay cùng ID.
- Giới hạn 1 lần/10 giây/user trên một tiến trình, cộng guard beta hiện có. Reset khi restart, chưa là quota bền vững hay chống lạm dụng production.
- Đổi avatar cập nhật Auth, dữ liệu riêng users và hồ sơ cộng đồng đã tồn tại. Nếu cập nhật hồ sơ cộng đồng bị rules chặn, avatar tài khoản vẫn lưu; cần mở chỉnh sửa hồ sơ để đồng bộ lại. Không tự tạo hồ sơ công khai.
- Ảnh avatar/bìa là URL công khai, người có URL có thể xem. Không dùng endpoint này cho ảnh tin nhắn riêng tư.
- Gửi ảnh chat và bài đăng chưa được xây trong đợt này. Chat ảnh cần kiểm tra thành viên/block, lưu media riêng tư, cấp URL có thời hạn. Bài đăng cần audience, feed/pagination, báo cáo, xóa bài/ảnh và quota; không dùng bảng upload AI làm feed.
- Hủy request không đảm bảo thu hồi được request Cloudinary đã nhận. Xóa tài khoản/ảnh trên Cloudinary cần bổ sung luồng xóa backend, chưa tự động trong beta này.

## Kiểm tra kỹ thuật

`node --test security-tests/profile-media.test.cjs security-tests/community-ui.test.cjs security-tests/cover-upload.test.cjs tests/pwa.test.mjs`

`python -m unittest discover -s regression_tests -p 'test_profile_media.py'`

Firestore Emulator: chạy bộ `security-tests/community.test.cjs` với `security-tests/firestore.rules` mới. Không chạy test vào Firebase production.
