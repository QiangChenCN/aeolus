from analytics.core.paths import ROOT, PY_HOME, _ROOT  # noqa: E402,F401 <<<


# -*- coding: utf-8 -*-
"""sources/* 共用的「会话失效」类型与判定。

登录 / 重登由 NestJS 独占：`AeolusCookieService` 负责 validToken 探针、强制重登与进程内复用。
Python 侧不持有登录实现、不触发重登，只把 Nest 返回的会话失效错误作为失败上报；
本模块只提供统一的异常类型与判定辅助。
"""

__all__ = [
    "SESSION_CODES", "AuthError", "ApiError",
]

# 代表「会话失效」的接口错误码。
# 401 是 HTTP 语义码；UNAUTHORIZED 是该接口 401 时 error.name 的实际取值。
SESSION_CODES = ("401", "UNAUTHORIZED")


class AuthError(Exception):
    """会话失效（单点登录被顶号 / cookie 过期）。sources/* 统一使用这一个类型。"""


class ApiError(RuntimeError):
    """接口错误，带 code。继承 RuntimeError 以兼容既有「捕获 RuntimeError」的调用方。

    code 让调用方能区分「会话失效」与「其它业务/服务错误」，不必依赖
    message 字符串匹配（脆弱：文案一改就失效）。
    """

    def __init__(self, message, code=""):
        super().__init__(message)
        self.code = str(code or "")


