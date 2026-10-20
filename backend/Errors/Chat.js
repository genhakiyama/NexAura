// Lỗi khi tạo đoạn chat (chatService: chat 1-1 và chat nhóm).
const AppError = require('./base');

// -----------------------------------------
// CÁC LỖI CƠ BẢN & ĐỊNH DẠNG (VALIDATION)
// -----------------------------------------

class InvalidChatNameError extends AppError {
  static defaultCode = 'CHAT_INVALID_NAME';
  static defaultMessage = 'Tên đoạn chat không hợp lệ.';
  static defaultStatusCode = 422;
}

class CannotChatWithSelfError extends AppError {
  static defaultCode = 'CHAT_WITH_SELF';
  static defaultMessage = 'Bạn không thể tạo đoạn chat với chính mình.';
  static defaultStatusCode = 400;
}

class DuplicateParticipantsError extends AppError {
  static defaultCode = 'CHAT_DUPLICATE_PARTICIPANTS';
  static defaultMessage = 'Danh sách thành viên chứa người dùng bị trùng lặp.';
  static defaultStatusCode = 422;
}

class InvalidParticipantIdFormatError extends AppError {
  static defaultCode = 'CHAT_INVALID_PARTICIPANT_ID';
  static defaultMessage = 'Định dạng ID của người dùng không hợp lệ.';
  static defaultStatusCode = 400;
}

// -----------------------------------------
// CÁC LỖI LIÊN QUAN ĐẾN THÀNH VIÊN & NHÓM
// -----------------------------------------

// Người được mời vào đoạn chat không tồn tại.
class ChatParticipantNotFoundError extends AppError {
  static defaultCode = 'CHAT_PARTICIPANT_NOT_FOUND';
  static defaultMessage = 'Không tìm thấy người dùng bạn muốn trò chuyện.';
  static defaultStatusCode = 404;
}

// Chat nhóm cần tối thiểu số thành viên theo quy định.
class NotEnoughParticipantsError extends AppError {
  static defaultCode = 'CHAT_NOT_ENOUGH_PARTICIPANTS';
  static defaultMessage = 'Đoạn chat nhóm cần có thêm thành viên.';
  static defaultStatusCode = 422;
}

class TooManyParticipantsError extends AppError {
  static defaultCode = 'CHAT_TOO_MANY_PARTICIPANTS';
  static defaultMessage = 'Số thành viên vượt quá giới hạn cho phép.';
  static defaultStatusCode = 422;
}

// Chat 1-1 giữa hai người đã có sẵn. Nên truyền details: { chatId } để client mở lại.
class ChatAlreadyExistsError extends AppError {
  static defaultCode = 'CHAT_ALREADY_EXISTS';
  static defaultMessage = 'Đoạn chat này đã tồn tại.';
  static defaultStatusCode = 409;
}

// -----------------------------------------
// CÁC LỖI VỀ QUYỀN RIÊNG TƯ & CHẶN (PRIVACY)
// -----------------------------------------

// Một trong hai người đã chặn người kia.
class ParticipantBlockedError extends AppError {
  static defaultCode = 'CHAT_PARTICIPANT_BLOCKED';
  static defaultMessage = 'Không thể tạo đoạn chat do người dùng này đã chặn bạn hoặc bạn đã chặn họ.';
  static defaultStatusCode = 403;
}

// Người được mời chỉ cho phép bạn bè thêm vào nhóm/nhắn tin.
class PrivacySettingsRestrictedError extends AppError {
  static defaultCode = 'CHAT_PRIVACY_RESTRICTED';
  static defaultMessage = 'Không thể mời người dùng này do cài đặt quyền riêng tư của họ.';
  static defaultStatusCode = 403;
}

// -----------------------------------------
// CÁC LỖI VỀ HẠN MỨC & HỆ THỐNG (LIMITS & SYSTEM)
// -----------------------------------------

class ChatCreateRateLimitedError extends AppError {
  static defaultCode = 'CHAT_CREATE_RATE_LIMITED';
  static defaultMessage = 'Bạn tạo đoạn chat quá nhiều lần, vui lòng thử lại sau.';
  static defaultStatusCode = 429;
}

// Người tạo đã đạt tới hạn mức tối đa các nhóm/đoạn chat được phép tham gia.
class MaxChatsLimitReachedError extends AppError {
  static defaultCode = 'CHAT_MAX_LIMIT_REACHED';
  static defaultMessage = 'Bạn đã đạt giới hạn số lượng đoạn chat được phép tạo hoặc tham gia.';
  static defaultStatusCode = 403;
}

// Tài khoản đang bị khóa tính năng nhắn tin (ví dụ: bị report spam trước đó).
class UserActionRestrictedError extends AppError {
  static defaultCode = 'CHAT_USER_RESTRICTED';
  static defaultMessage = 'Tài khoản của bạn hiện đang bị hạn chế tính năng tạo đoạn chat/nhóm mới.';
  static defaultStatusCode = 403;
}

// Lỗi hệ thống khi lưu đoạn chat (ví dụ database lỗi). Chỉ ghi log chi tiết phía server.
class ChatCreateFailedError extends AppError {
  static defaultCode = 'CHAT_CREATE_FAILED';
  static defaultMessage = 'Không thể tạo đoạn chat lúc này, vui lòng thử lại sau.';
  static defaultStatusCode = 500;
}

module.exports = {
  InvalidChatNameError,
  CannotChatWithSelfError,
  DuplicateParticipantsError,
  InvalidParticipantIdFormatError,
  
  ChatParticipantNotFoundError,
  NotEnoughParticipantsError,
  TooManyParticipantsError,
  ChatAlreadyExistsError,
  
  ParticipantBlockedError,
  PrivacySettingsRestrictedError,
  
  ChatCreateRateLimitedError,
  MaxChatsLimitReachedError,
  UserActionRestrictedError,
  ChatCreateFailedError,
};