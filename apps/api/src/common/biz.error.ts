/**
 * 业务错误（可预期的校验/操作失败）。
 *
 * 与普通 Error 的区别：HttpExceptionFilter 会把 BizError 映射为 **400** 并把 message
 * 原样下发（前端直接展示），而普通 Error 保持 500（GET 5xx 会触发前端重试，
 * 对确定性校验错误纯属浪费）。人事模块等表单校验类错误一律抛 BizError。
 */
export class BizError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BizError';
  }
}
