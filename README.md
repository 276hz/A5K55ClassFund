# ClassFund — Quỹ lớp 11A5 (THPT Cẩm Bình)

Ứng dụng web quản lý quỹ lớp, giao diện tiếng Việt, tối ưu iPhone. Nền tảng: Next.js App Router + Supabase Auth/Postgres/RLS + Cloudflare Workers (OpenNext).

> **Trạng thái:** source đã được chuyển sang đăng nhập username và cấu hình Cloudflare Workers. ZIP không chứa thông tin bí mật hay mật khẩu. Môi trường đóng gói không truy cập được npm registry nên chưa tạo lockfile và chưa chạy được Vitest/TypeScript/production build/Workers preview. Cần xác minh các bước này trong Cloudflare Workers Builds hoặc môi trường có mạng trước khi sử dụng tiền quỹ thật. Chưa có deployment live.

## Tài khoản đăng nhập

- Không cần email cá nhân. Supabase Auth vẫn xử lý xác thực mật khẩu; username được ánh xạ nội bộ thành địa chỉ không thể nhận thư dạng `username@login.classfund.invalid`.
- Hai tài khoản được tạo sẵn bởi script: `thuydung` (Đặng Thùy Dung) và `thuytrang` (Nguyễn Thùy Trang).
- Mỗi tài khoản có mật khẩu khởi tạo ngẫu nhiên riêng, chỉ in ra một lần khi chạy script provisioning. Đăng nhập lần đầu sẽ bị chuyển đến trang đổi mật khẩu.
- Không có đăng ký công khai, không gửi email reset. Nếu quên mật khẩu, chủ dự án chạy lại script với `--reset-passwords`; script cấp mật khẩu tạm mới cho cả hai và hiển thị một lần.
- Không commit hoặc gửi mật khẩu qua nhóm lớp. Lưu chúng tạm thời ở nơi riêng tư rồi xóa an toàn sau khi hai người đã đăng nhập và đổi mật khẩu.

## Tính năng chính

- Dashboard: tiền thực nhận, phải thu, còn thiếu, tự nguyện, chờ đối soát, lời hứa nộp và tiến độ.
- Học sinh: tìm kiếm, thêm/sửa/lưu trữ, nhập CSV, xuất CSV, hồ sơ từng học sinh.
- Khoản thu: cố định, tự nguyện, tùy chỉnh theo học sinh; miễn đóng, loại trừ, điều chỉnh.
- Quick Entry: thanh toán nhiều lần, nhiều phương thức, chống gửi trùng.
- Đối soát chuyển khoản, hoàn tiền, đảo giao dịch, audit log append-only.
- Trang công khai chỉ hiển thị tổng hợp, không hiển thị số tiền cá nhân.

## 1. Thiết lập Supabase (một lần)

1. Tạo một Supabase project.
2. Mở **SQL Editor → New query**, dán toàn bộ `supabase/setup.sql`, nhấn **Run**. File này đã gộp migrations `0001` đến `0004`; project mới chỉ cần chạy một lần. Không chạy lặp trên database đang có dữ liệu.
3. Trong Authentication → Providers, bật Email/Password (vẫn cần provider này vì Supabase Auth dùng password flow), tắt **Allow new users to sign up**. Không cần cấu hình SMTP hoặc email cá nhân cho hai thủ quỹ; script tạo user qua Admin API và đánh dấu email nội bộ là confirmed.
4. Lấy Project URL và anon/publishable key trong Project Settings → API.

### Tạo hai tài khoản username + mật khẩu tạm (không cần terminal)

Nếu chỉ dùng iPhone, không cần chạy `npm run provision` và không cần service-role key:

1. Trong Supabase Dashboard, mở **Authentication → Users → Add user → Create new user**.
2. Tạo tài khoản thứ nhất bằng email nội bộ `thuydung@login.classfund.invalid`; đặt một mật khẩu tạm đủ mạnh và xác nhận email ngay trong Dashboard nếu có tùy chọn.
3. Tạo tài khoản thứ hai bằng email nội bộ `thuytrang@login.classfund.invalid`; đặt mật khẩu tạm riêng và xác nhận email.
4. Mở **SQL Editor → New query**, dán toàn bộ file `supabase/assign-treasurers.sql`, rồi nhấn **Run**. Kết quả phải hiện đúng hai thủ quỹ với username `thuydung` và `thuytrang`, role `treasurer`, `must_change_password = true`.
5. Gửi mật khẩu tạm riêng cho từng thủ quỹ. Khi đăng nhập lần đầu, ứng dụng bắt buộc đổi mật khẩu.

Các địa chỉ `@login.classfund.invalid` chỉ là định danh nội bộ để Supabase Auth xử lý đăng nhập bằng password; không phải hộp thư và không cần SMTP. Không dùng email thật của học sinh.

**Lưu ý:** `supabase/assign-treasurers.sql` chỉ chạy sau khi đã tạo cả hai Auth users trong Dashboard và sau khi `supabase/setup.sql` đã chạy thành công. Không chạy lặp để reset mật khẩu. Nếu cần đổi mật khẩu sau này, dùng chức năng quản trị người dùng trong Supabase Dashboard.

Nếu có máy tính, script `npm run provision` vẫn tồn tại như một phương án thay thế; nó cần service-role key chỉ trong môi trường cục bộ. Không bao giờ thêm service-role key vào Cloudflare Worker, GitHub hoặc trình duyệt.

## 2. Deploy Cloudflare Workers

Đây là ứng dụng Next.js App Router có server routes, auth và database calls. Vì vậy nó deploy lên **Cloudflare Workers thông qua OpenNext**, không phải Cloudflare Pages static hosting.

### Cách dễ nhất: GitHub + Workers Builds (không dùng Cloudflare Pages)

1. Đưa **nội dung bên trong** thư mục `classfund/` (không phải thư mục ZIP bọc bên ngoài) lên root của một GitHub repository. Nếu giữ nguyên thư mục con, đặt Workers Builds Root directory thành `/classfund`.
2. Cloudflare Dashboard → **Workers & Pages** → **Create application** → **Workers** → **Connect to Git** (hoặc mở Worker → Settings → Builds để kết nối repo). Không tạo project dạng Pages. Đặt Worker name là `classfund-11a5` để khớp `wrangler.jsonc`.
3. Chọn repository ClassFund.
4. Trong Worker → **Settings → Build**, đặt Build command: `npx @opennextjs/cloudflare build`.
5. Đặt Deploy command: `npx @opennextjs/cloudflare deploy`. Với preview branch, đặt Preview deploy command là `npx @opennextjs/cloudflare upload` nếu cấu hình trường này.
6. Đặt build environment Node.js version 22.
7. Thêm đúng hai biến `NEXT_PUBLIC_SUPABASE_URL` và `NEXT_PUBLIC_SUPABASE_ANON_KEY` trong **Build variables and secrets** (để Next.js đọc lúc build), đồng thời khai báo cùng hai giá trị ở Worker **Settings → Variables & Secrets** (runtime). Không thêm `SUPABASE_SERVICE_ROLE_KEY`. Thiết lập tương ứng cho Preview nếu dùng.
8. Deploy. Kiểm tra domain Worker, trang công khai `/`, đăng nhập hai tài khoản và đổi mật khẩu lần đầu.

`wrangler.jsonc` đã cấu hình Worker `classfund-11a5`, OpenNext entrypoint, assets, self-reference service binding và Node.js compatibility. Nếu muốn deploy từ terminal thay vì GitHub, chạy `npm install`, đăng nhập Wrangler rồi chạy `npm run deploy`.

### Preview trước khi deploy

```bash
npm install
cp .dev.vars.example .dev.vars
# sửa .dev.vars với Supabase URL và anon key
npm run preview
```

Không commit `.dev.vars`. Cloudflare Worker runtime chỉ cần URL và anon key. Không cần service-role key cho hoạt động web thông thường.

## 3. Nhập danh sách học sinh

Học sinh → Nhập danh sách từ CSV → chọn UTF-8 CSV có cột `full_name` và `student_number` tùy chọn → xem trước, sửa lỗi/trùng → nhập. Không có danh sách học sinh thật trong source.

## 4. Kiểm thử

```bash
npm install
npm run typecheck
npm test
npm run build
npm run preview
```

Để kiểm tra database/RLS riêng, cấu hình `TEST_DATABASE_URL` trỏ tới database test trống và chạy `npm run test:db`. Không dùng database production cho test.

## 5. Bảo mật và dữ liệu

- RLS, quyền thủ quỹ và RPC vẫn là lớp kiểm soát cuối cùng.
- Không có public signup. Chỉ hai user được cấp role `treasurer`.
- Username không phải email nhận thư. Vì không có email khôi phục, chủ dự án phải cấp lại mật khẩu qua Supabase Dashboard khi thủ quỹ quên mật khẩu.
- Tiền lưu integer/bigint VND; không xóa giao dịch lịch sử.
- Không nhập dữ liệu học sinh nhạy cảm không cần thiết.
- Không công khai số tiền cá nhân, ghi chú, mã giao dịch hoặc lịch sử chi tiết.
- Backup chứa dữ liệu tài chính và tên học sinh phải được giữ riêng tư.

## Cấu trúc quan trọng

```text
src/                  Next.js app, routes, components, Supabase clients
supabase/migrations/  0001–0004 database migrations
supabase/setup.sql    One-shot SQL for a new Supabase project
supabase/assign-treasurers.sql  Link Dashboard-created Auth users to treasurer roles
scripts/              Optional local treasurer provisioning (not required on iPhone)
wrangler.jsonc        Cloudflare Workers configuration
open-next.config.ts   OpenNext Cloudflare adapter configuration
tests/                Vitest tests
```

## Giới hạn đã biết

- Chưa deploy live; cần chạy build và Workers preview bằng dependencies đã cài.
- Không có email reset vì tài khoản dùng username; chủ dự án cấp lại mật khẩu trong Supabase Dashboard.
- Rate limiting trong tiến trình chưa phải bộ đếm phân tán.
- CSP hiện còn `unsafe-inline` theo cấu hình Next.js hiện tại.
- Cần test RLS trên Supabase project thực tế trước khi quản lý tiền thật.
