// Lỗi của authService (đăng nhập, đăng ký, token).
const AppError = require('./base');

class InvalidCredentialsError extends AppError {
  static defaultCode = 'AUTH_INVALID_CREDENTIALS';
  static defaultMessage = 'Tên đăng nhập hoặc mật khẩu không đúng.';
  static defaultStatusCode = 401;
}

class InvalidTokenError extends AppError {
  static defaultCode = 'AUTH_INVALID_TOKEN';
  static defaultMessage = 'Token không hợp lệ.';
  static defaultStatusCode = 401;
}

class TokenExpiredError extends AppError {
  static defaultCode = 'AUTH_TOKEN_EXPIRED';
  static defaultMessage = 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.';
  static defaultStatusCode = 401;
}

class UserAlreadyExistsError extends AppError {
  static defaultCode = 'AUTH_USER_ALREADY_EXISTS';
  static defaultMessage = 'Tên đăng nhập đã được sử dụng.';
  static defaultStatusCode = 409;
}

class PermissionDeniedError extends AppError {
  static defaultCode = 'AUTH_PERMISSION_DENIED';
  static defaultMessage = 'Bạn không có quyền thực hiện thao tác này.';
  static defaultStatusCode = 403;
}

// --- CÁC LỖI BỔ SUNG THÊM ---

class AccountLockedError extends AppError {
  static defaultCode = 'AUTH_ACCOUNT_LOCKED';
  static defaultMessage = 'Tài khoản của bạn đã bị khóa do đăng nhập sai quá nhiều lần hoặc vi phạm chính sách.';
  static defaultStatusCode = 403;
}

class AccountNotVerifiedError extends AppError {
  static defaultCode = 'AUTH_ACCOUNT_NOT_VERIFIED';
  static defaultMessage = 'Tài khoản chưa được xác minh. Vui lòng kiểm tra email hoặc số điện thoại.';
  static defaultStatusCode = 403; // Hoặc 401 tùy logic hệ thống
}

class UserNotFoundError extends AppError {
  static defaultCode = 'AUTH_USER_NOT_FOUND';
  static defaultMessage = 'Không tìm thấy thông tin người dùng này trong hệ thống.';
  static defaultStatusCode = 404;
}

class EmailAlreadyExistsError extends AppError {
  static defaultCode = 'AUTH_EMAIL_ALREADY_EXISTS';
  static defaultMessage = 'Địa chỉ email này đã được liên kết với một tài khoản khác.';
  static defaultStatusCode = 409;
}

class WeakPasswordError extends AppError {
  static defaultCode = 'AUTH_WEAK_PASSWORD';
  static defaultMessage = 'Mật khẩu không đủ mạnh. Vui lòng bao gồm chữ hoa, chữ thường, số và ký tự đặc biệt.';
  static defaultStatusCode = 400; // Bad Request
}

class RefreshTokenExpiredError extends AppError {
  static defaultCode = 'AUTH_REFRESH_TOKEN_EXPIRED';
  static defaultMessage = 'Refresh token đã hết hạn, vui lòng đăng nhập lại từ đầu.';
  static defaultStatusCode = 401;
}

module.exports = {
  InvalidCredentialsError,
  InvalidTokenError,
  TokenExpiredError,
  UserAlreadyExistsError,
  PermissionDeniedError,
  // Xuất các lỗi mới
  AccountLockedError,
  AccountNotVerifiedError,
  UserNotFoundError,
  EmailAlreadyExistsError,
  WeakPasswordError,
  RefreshTokenExpiredError,
};