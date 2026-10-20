/**
 * Lớp lỗi gốc cho toàn bộ chat-app.
 *
 * Mọi lỗi nghiệp vụ đều kế thừa AppError, nhờ đó HTTP và WebSocket
 * cùng dùng chung một định dạng lỗi:
 *
 *   { code: 'ROOM_NOT_FOUND', message: 'Phòng không tồn tại.', details: {...} }
 *
 * - code:    ổn định, dành cho client (quyết định hiển thị gì).
 * - message: câu thông báo cho người dùng đọc.
 * - details: thông tin thêm (tuỳ chọn), ví dụ tên trường bị sai.
 */
class AppError extends Error {
  static defaultCode = 'APP_ERROR';
  static defaultMessage = 'Đã có lỗi xảy ra.';
  static defaultStatusCode = 400;

  constructor(message, options = {}) {
    super(message || new.target.defaultMessage);
    this.name = new.target.name;
    this.code = options.code || new.target.defaultCode;
    this.statusCode = options.statusCode || new.target.defaultStatusCode;
    this.details = options.details;
    Error.captureStackTrace(this, new.target);
  }

  toJSON() {
    const data = { code: this.code, message: this.message };
    if (this.details) data.details = this.details;
    return data;
  }

  /** Dạng gửi qua WebSocket: { type: 'error', payload: {...} } */
  toWsEvent() {
    return { type: 'error', payload: this.toJSON() };
  }
}

module.exports = AppError;
