# Bảo mật ClassFund

## Xác thực username
- Supabase Auth vẫn kiểm tra mật khẩu; giao diện nhận username và ánh xạ sang `username@login.classfund.invalid`.
- Domain `.invalid` là định danh nội bộ không nhận email; không cần thu thập email cá nhân hoặc cấu hình SMTP.
- Có thể tạo hai Auth users trong Supabase Dashboard rồi chạy `supabase/assign-treasurers.sql` trong SQL Editor để gán profile/role; cách này không cần service-role key hoặc terminal.
- Phương án thay thế trên máy tính là provisioning script cục bộ; service-role key chỉ dùng cục bộ và không bao giờ đặt lên Worker.
- Mật khẩu do quản trị viên đặt trong Dashboard hoặc script cục bộ; chia sẻ riêng và yêu cầu đổi ngay lần đăng nhập đầu tiên.
- Middleware buộc người dùng có `must_change_password=true` đổi mật khẩu trước khi truy cập ứng dụng; API RPC cũng chặn thao tác cho đến khi hoàn tất.
- Không có email reset. Chủ dự án cấp lại mật khẩu trong Supabase Dashboard và gửi riêng cho đúng thủ quỹ.

## Bí mật và Cloudflare
- Cloudflare Worker chỉ cần Supabase URL và anon key.
- `SUPABASE_SERVICE_ROLE_KEY` chỉ dùng trên máy quản trị khi chạy provisioning. Không đặt thành Worker variable/secret.
- Không commit `.env`, `.dev.vars`, credentials, backup hoặc file danh sách học sinh.

## Phân quyền và dữ liệu
- Supabase RLS bật/force; chỉ treasurer được đọc bảng nghiệp vụ.
- Mọi thao tác ghi tài chính đi qua RPC `SECURITY DEFINER`, kiểm tra `assert_treasurer()` và actor lấy từ `auth.uid()`.
- Không có quyền ghi trực tiếp từ client; lịch sử tài chính/audit log không cho sửa/xóa thông thường.
- Trang public chỉ gọi `public_progress()` và không xuất dữ liệu từng học sinh.

## Giới hạn còn lại
- Rate limiting trong bộ nhớ từng Worker instance không thay thế rate limiting phân tán.
- CSP hiện vẫn có `unsafe-inline`; cần harden nonce-based trước khi tăng phạm vi sử dụng.
- Cơ chế đổi mật khẩu lần đầu được điều khiển bởi profile flag và UI/server route guard; cần kiểm thử end-to-end trên Supabase trước khi dùng production.
- Chưa xác minh được RLS trên project Supabase thật nếu chưa có credentials.
