import Link from "next/link";
export default function AccountHelpPage() {
  return (
    <main className="mx-auto max-w-sm p-4 pt-16">
      <h1 className="text-2xl font-semibold">Hỗ trợ tài khoản</h1>
      <section className="card mt-6 space-y-3 text-sm">
        <p>ClassFund sử dụng tên đăng nhập, không sử dụng email cá nhân để đặt lại mật khẩu.</p>
        <p>Nếu quên mật khẩu, hãy liên hệ người quản lý dự án để cấp lại mật khẩu khởi tạo. Mật khẩu mới sẽ được tạo riêng và chỉ hiển thị một lần khi cấp lại.</p>
        <p>Không gửi mật khẩu qua nhóm lớp hoặc kênh công khai.</p>
        <Link href="/login" className="btn-primary block w-full text-center">Quay lại đăng nhập</Link>
      </section>
    </main>
  );
}
