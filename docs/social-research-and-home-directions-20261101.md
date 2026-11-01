# ADOLF KIMKIM — Story, bài đăng và hướng thiết kế Home
Ngày: 01/11/2026. Phạm vi: Social đang dùng, không thay đổi mô hình/prompt/endpoint AI.

## Nguồn và giới hạn nghiên cứu
- Meta, giới thiệu Instagram Stories: https://about.fb.com/ja/news/2016/08/instagram_instagramstories/ — story theo chuỗi, xuất hiện ở thanh đầu Feed, vòng avatar khi có nội dung mới, điều hướng trong chuỗi; tài liệu nền tảng, không phải kiểm tra trực tiếp ứng dụng Instagram hiện tại.
- Meta, Highlights và Archive: https://about.fb.com/ja/news/2017/12/instagram_highlight_archive/amp/ — story thông thường 24h; highlight trên profile, archive riêng tư.
- Meta, New Stickers (2024): https://about.fb.com/news/2024/05/new-stickers-in-instagram-stories/ — music, stickers và thư viện của Instagram.
- Meta, 2026 Instagram Plus: https://about.fb.com/ja/news/2026/06/introducing-instagram-plus/amp/ — có ngoại lệ trả phí cho thời hạn 48h. KimKim giữ yêu cầu 24h, không mô phỏng gói Plus.
- Apple Materials: https://developer.apple.com/design/human-interface-guidelines/materials — kính cho điều khiển/navigation, không phủ toàn bộ vùng nội dung; sử dụng tiết chế và ưu tiên đọc rõ.
- Google Material 3: https://developer.android.com/develop/ui/compose/designsystems/material3 — màu theo vai trò, surface/on-surface và theme sáng/tối đồng bộ.
- Instagram Help Center hiện trả 429; không có phiên đăng nhập Instagram để kiểm tra trực tiếp. Thao tác pinch/twist là mẫu tương tác tham khảo, không tuyên bố giống từng pixel hay mọi tính năng Instagram.

## Đối chiếu và bản sửa
| Hành vi | Trước | Bản sửa |
|---|---|---|
| Một người đăng nhiều story | Đã gom một vòng; chỉ đọc tối đa 20 mục có thể bỏ sót | Phân trang metadata, một vòng/người; thử 25 story |
| Thời hạn | 24h theo từng createdAt | Giữ nguyên; cập nhật feed mỗi phút, highlight chỉ ở profile |
| Tiếp tục xem | Luôn từ mục đầu | Mở story chưa xem đầu tiên; hết story chuyển người tiếp theo từ Feed |
| Đã xem/chưa xem | Không phân biệt | Vòng nhấn/chìm, nhớ theo tài khoản; đồng bộ document riêng của người xem |
| Điều hướng | Nút và phím trái/phải | Thêm tap trái/phải, giữ để tạm dừng, vuốt đổi người, vuốt xuống đóng |
| Căn chỉnh | Kéo vị trí, thanh cỡ/xoay | Chụm/xoay hai ngón, vạch căn giữa, nút căn giữa, nhân bản, sửa lại chữ, phím mũi tên |
| Ảnh nền story | Fit/fill | Thêm kéo/chụm/xoay ảnh nền; chuẩn hóa cùng khung 9:16 |
| GIF | Có thể bị in thêm vào poster | Poster xuất không in GIF, GIF động nằm ở lớp hiển thị |
| Post | Text + 1 ảnh + xóa | Album 1–5 ảnh, cắt 1:1 / 4:5 / 16:9, vị trí + zoom, preview và chú thích |
| Tương tác post | Chưa có | Chi tiết album, thích/bỏ thích, bình luận và xóa bình luận theo quyền, sửa chú thích, lưu/bỏ lưu, danh sách đã lưu, link riêng có kiểm tra quyền |

## Quyền riêng tư và điều kiện hoạt động
1. Story/album vẫn dùng post draft, mediaId chuẩn và Cloudinary authenticated; không ghi URL riêng tư vào Firestore.
2. API album kiểm tra quyền qua Firebase token và Rules của document cha trên mỗi lượt đọc.
3. Thích/bình luận/sửa chú thích cần publish **firebase/firestore-community-v6.rules**. V5 đang từ chối các thao tác đó. Chưa có quyền quản trị Firebase trong phiên này, nên chưa publish lên Firebase thật.
4. V6 giữ dữ liệu /users riêng tư; chặn người chưa kết bạn, người bị block và giả mạo UID. Comment <= 1000 ký tự; caption <= 2000. Thích hiển thị tối đa 100+ và bình luận tải 50 mục mới nhất trong beta; chưa phải tổng đếm vô hạn.
5. Seen state và Saved ở /users/{uid}; không công khai danh sách ai đã xem story. Chưa triển khai analytics lượt xem cho tác giả.
6. Nhạc/GIF từ thiết bị; chưa có danh mục nhạc/GIPHY, video story, cutouts AI hoặc mọi sticker tương tác của Instagram.
7. Metadata phân trang theo 20 mục (không cần composite index mới). Cần theo dõi lượng đọc khi tăng số bạn/bài; khi mở rộng nên tạo feed theo thời gian và chuyển việc phân phối sang backend.
8. Story hết hạn được ẩn trong UI; chưa có tác vụ tự xóa media Cloudinary sau 24h. Highlights được lưu theo từng story, chưa có album highlight nhiều story có tên riêng.

## Kiểm tra
- 26 kiểm thử JS: hình học pinch/rotate/snap, 25 story/phân trang, trạng thái seen, tương tác ghi thật qua SDK mock, chống HTML injection, giữ draft/focus và hồi quy Messenger/PWA.
- 25 kiểm thử Rules qua Firestore Emulator, gồm friendship, block, giả UID, sửa caption, xóa comment và riêng tư seen/saved.
- 5 kiểm thử API album: từ chối URL ngoài, giới hạn số ảnh, owner draft, chuẩn hóa ảnh, lưu album/poster riêng tư và chặn giao ảnh trước khi kiểm tra quyền.
- UI mobile được kiểm tra trên dữ liệu giả; luồng thêm chữ/căn giữa đã xác nhận. Upload album tới Cloudinary thật và tương tác giữa hai tài khoản production chưa được kiểm tra. Cần publish Rules V6 để hoàn tất tương tác trên production.

## Ba hướng Home và màu sắc — CHƯA áp dụng toàn app
Mục tiêu: giữ ADOLF KIMKIM, mascot chó KimKim và màu xanh; giảm nền gradient tím/xám phủ toàn màn, card chồng card, viền sáng và blur dày. Không dùng các số liệu hoặc lịch họp giả.

| Hướng | Bố cục Home | Dark: nền / surface / chữ | Light: nền / surface / chữ | Nhấn |
|---|---|---|---|---|
| Royal Slate | Một khu bắt đầu: ghi âm, URL Meet hoặc tải tệp; bên dưới danh sách tiếp tục làm việc | #171D2B / #222B3D / #F0F3FA | #F2F4F8 / #FFFFFF / #202B40 | Dark #8CA9FF, Light #466CF6 |
| Cobalt Editorial | Hero bất đối xứng, mascot rõ, ghi âm là hành động chính; tệp gần đây thành các hàng gọn | #1D2029 / #292D39 / #F5F2EB | #EEEDEA / #FAF9F6 / #262B37 | Dark #8FAAFF, Light #315EFB |
| Blue Hour | Tách hai ngữ cảnh Công việc / Kết nối; Home tập trung tiếp tục nội dung, có đường sang Social/Messenger | #1B2740 / #273754 / #EFF4FF | #EAF0F6 / #F7FAFD / #25324A | Dark #A5B8FF, Light #4566CC |

Royal Slate phù hợp nhất nếu ưu tiên rõ ràng, dễ dùng hằng ngày. Cobalt Editorial nhấn branding mạnh hơn. Blue Hour phù hợp hướng super app nhưng cần giữ Công việc và Kết nối tách bạch.

Quy tắc chung: body 14–16px; chữ phụ vẫn đủ tương phản; đường viền nhẹ, màu trạng thái có nhãn; glass chỉ ở navigation/popover; không hiệu ứng nền liên tục; tôn trọng reduced motion. Các mã màu là đề xuất, cần đo tương phản từng cặp trên component thực trước khi triển khai.
