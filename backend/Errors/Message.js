const AppError = require('./base');

// Các lỗi liên quan đến nội dung và sự tồn tại của tin nhắn
class MessageNotFoundError extends AppError {
  static defaultCode = 'MESSAGE_NOT_FOUND';
  static defaultMessage = 'Tin nhắn không tồn tại hoặc đã bị xóa.';
  static defaultStatusCode = 404;
}

class EmptyMessageError extends AppError {
  static defaultCode = 'EMPTY_MESSAGE';
  static defaultMessage = 'Nội dung tin nhắn không được để trống.';
  static defaultStatusCode = 400;
}

class MessageTooLongError extends AppError {
  static defaultCode = 'MESSAGE_TOO_LONG';
  static defaultMessage = 'Nội dung tin nhắn vượt quá số lượng ký tự cho phép.';
  static defaultStatusCode = 400;
}

// Các lỗi liên quan đến quyền và bảo mật
class UnauthorizedMessageActionError extends AppError {
  static defaultCode = 'UNAUTHORIZED_MESSAGE_ACTION';
  static defaultMessage = 'Bạn không có quyền thực hiện hành động này (chỉnh sửa/xóa) với tin nhắn này.';
  static defaultStatusCode = 403;
}

class RecipientBlockedError extends AppError {
  static defaultCode = 'RECIPIENT_BLOCKED';
  static defaultMessage = 'Không thể gửi tin nhắn do bạn đã bị chặn hoặc giới hạn quyền riêng tư.';
  static defaultStatusCode = 403;
}

// Các lỗi liên quan đến trạng thái và giới hạn
class MessageRateLimitExceededError extends AppError {
  static defaultCode = 'MESSAGE_RATE_LIMIT_EXCEEDED';
  static defaultMessage = 'Bạn gửi tin nhắn quá nhanh. Vui lòng chờ một lát rồi thử lại.';
  static defaultStatusCode = 429;
}

class MessageAlreadyDeletedError extends AppError {
  static defaultCode = 'MESSAGE_ALREADY_DELETED';
  static defaultMessage = 'Tin nhắn này đã bị xóa hoặc thu hồi trước đó.';
  static defaultStatusCode = 400;
}

// Các lỗi liên quan đến dữ liệu đính kèm (nếu app có gửi ảnh/file)
class InvalidAttachmentError extends AppError {
  static defaultCode = 'INVALID_ATTACHMENT';
  static defaultMessage = 'Tệp đính kèm không hợp lệ hoặc không được hỗ trợ.';
  static defaultStatusCode = 422;
}

class AttachmentTooLargeError extends AppError {
  static defaultCode = 'ATTACHMENT_TOO_LARGE';
  static defaultMessage = 'Tệp đính kèm vượt quá dung lượng cho phép.';
  static defaultStatusCode = 413; // 413 Payload Too Large
}

// Lỗi liên quan đến phòng chat / người nhận
class RecipientNotFoundError extends AppError {
  static defaultCode = 'RECIPIENT_NOT_FOUND';
  static defaultMessage = 'Người nhận hoặc nhóm chat không tồn tại.';
  static defaultStatusCode = 404;
}

module.exports = { 
  MessageNotFoundError, 
  EmptyMessageError, 
  MessageTooLongError,
  UnauthorizedMessageActionError,
  RecipientBlockedError,
  MessageRateLimitExceededError,
  MessageAlreadyDeletedError,
  InvalidAttachmentError,
  AttachmentTooLargeError,
  RecipientNotFoundError
};