# Changelog

## 1.1.1
- Fixed explicit Supabase SSR cookie option types in server client and middleware to prevent implicit-any TypeScript build failure.
- Added a phone-friendly SQL step to link Dashboard-created Auth users to the two treasurer profiles without a local Node.js provisioning command or service-role key.
- Clarified Cloudflare Workers Builds deployment; this OpenNext app must not be deployed as a static Pages project.

# Changelog
## 1.0.0 – bản đầu (chưa build/triển khai)
- Schema, RLS, trigger bất biến, view kế toán, hàm RPC.
- Giao diện tiếng Việt: tổng quan, học sinh, khoản thu, ghi nhận, giao dịch, báo cáo, nhật ký, cài đặt, trang công khai.
- Nhập CSV học sinh, xuất CSV (giao dịch, công nợ, học sinh).
- Chưa có: nhập/xuất Excel, PDF, Playwright.


## 1.0.1 — Rà soát và sửa lỗi
- Chuẩn hóa ngày rỗng thành `null`; từ chối ngày lịch không tồn tại.
- Sửa tiến độ công khai để không cộng tiền tự nguyện vào tiến độ khoản bắt buộc.
- Sửa export báo cáo để áp dụng bộ lọc học sinh, khoản thu, phương thức và trạng thái; đọc phân trang thay vì chỉ lấy trang đầu.
- Ngăn thay đổi nghĩa vụ sau khi đã phát sinh giao dịch/điều chỉnh; giới hạn điều chỉnh giảm không vượt nghĩa vụ ban đầu còn có thể điều chỉnh.
- Tuần tự hóa cấp vai trò thủ quỹ và sửa script provisioning để không upsert role đã tồn tại.
- Cho phép thủ quỹ xem danh sách cả hai tài khoản trong phần Cài đặt.
- Bỏ `npm ci` khỏi Vercel install command vì source ban đầu không kèm lockfile; khuyến nghị tạo và commit lockfile trước production.
- Chưa thể chạy build/test do môi trường không truy cập được npm registry.

## 1.1.0 — Username + Cloudflare Workers
- Chuyển đăng nhập giao diện sang username, không yêu cầu email cá nhân.
- Cấp hai tài khoản `thuydung` và `thuytrang` với mật khẩu khởi tạo ngẫu nhiên hiển thị một lần.
- Thêm profile flag và flow đổi mật khẩu lần đầu; thay quên mật khẩu email bằng hướng dẫn reset do chủ dự án thực hiện.
- Thêm migration `0004_username_auth.sql` và cập nhật `supabase/setup.sql`.
- Chuyển cấu hình triển khai sang Cloudflare Workers qua OpenNext; bổ sung Wrangler, preview/deploy scripts và headers cho static assets.
