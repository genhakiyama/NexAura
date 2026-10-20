// Lỗi của emailService (định dạng email, xác thực email, gửi email).
const AppError = require('./base');

class InvalidEmailFormatError extends AppError {
  static defaultCode = 'EMAIL_INVALID_FORMAT';
  static defaultMessage = 'Địa chỉ email không hợp lệ.';
  static defaultStatusCode = 422;
}

class EmailAlreadyInUseError extends AppError {
  static defaultCode = 'EMAIL_ALREADY_IN_USE';
  static defaultMessage = 'Email này đã được sử dụng.';
  static defaultStatusCode = 409;
}

class EmailNotFoundError extends AppError {
  static defaultCode = 'EMAIL_NOT_FOUND';
  static defaultMessage = 'Không tìm thấy tài khoản với email này.';
  static defaultStatusCode = 404;
}

class EmailNotVerifiedError extends AppError {
  static defaultCode = 'EMAIL_NOT_VERIFIED';
  static defaultMessage = 'Email chưa được xác thực, vui lòng kiểm tra hộp thư.';
  static defaultStatusCode = 403;
}

class EmailVerificationInvalidError extends AppError {
  static defaultCode = 'EMAIL_VERIFICATION_INVALID';
  static defaultMessage = 'Mã xác thực email không hợp lệ.';
  static defaultStatusCode = 400;
}

class EmailVerificationExpiredError extends AppError {
  static defaultCode = 'EMAIL_VERIFICATION_EXPIRED';
  static defaultMessage = 'Mã xác thực email đã hết hạn, vui lòng yêu cầu gửi lại.';
  static defaultStatusCode = 400;
}

// Gửi email thất bại (lỗi SMTP / nhà cung cấp). Không đưa chi tiết lỗi nội bộ
// vào message hoặc details; hãy ghi log phía server.
class EmailSendFailedError extends AppError {
  static defaultCode = 'EMAIL_SEND_FAILED';
  static defaultMessage = 'Không thể gửi email lúc này, vui lòng thử lại sau.';
  static defaultStatusCode = 502;
}

class EmailRateLimitedError extends AppError {
  static defaultCode = 'EMAIL_RATE_LIMITED';
  static defaultMessage = 'Bạn yêu cầu gửi email quá nhiều lần, vui lòng thử lại sau.';
  static defaultStatusCode = 429;
}

module.exports = {
  InvalidEmailFormatError,
  EmailAlreadyInUseError,
  EmailNotFoundError,
  EmailNotVerifiedError,
  EmailVerificationInvalidError,
  EmailVerificationExpiredError,
  EmailSendFailedError,
  EmailRateLimitedError,
};
