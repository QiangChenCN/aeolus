r"""
DSH（DeepSeek Harness）Python SDK 的薄封装：只负责「跑一次 agent 任务」。

设计约束（与 compute 服务分工一致）：
- 本模块只做计算，不做鉴权；调用方 NestJS 已完成 RBAC / 数据权限裁决。
- SDK 依赖 deepseek-harness-sdk 是**可选依赖**：未安装时本模块仍可导入，端点返回明确错误，
  不会拖垮 compute 服务启动（见 `_load_sdk()`）。
- 每次调用使用独立的 Harness home（位于 apps/api/runtime/dsh-home/<session>）与一次性 workspace，
  通过 profile patch 关闭 shell / session-log 外传，仅保留只读问答能力。
- 并发限制为 1：2 核 4G 机器上 DSH 子进程峰值 300–500MB，并发跑会 OOM。
"""
from __future__ import annotations

import os
import re
import shutil
import threading
import uuid
from pathlib import Path
from typing import Any, Optional

# 与仓库根定位保持一致（main.py 已把 ROOT 注入 sys.path，这里独立计算以便单测）。
# 本文件位于 <repo>/services/compute/compute_api/，向上 4 层才是仓库根。
_ROOT = Path(__file__).resolve().parent.parent.parent.parent
_HOME_ROOT = _ROOT / 'apps' / 'api' / 'runtime' / 'dsh-home'
_WORKSPACE_ROOT = _ROOT / 'apps' / 'api' / 'runtime' / 'dsh-workspace'

# 只允许安全的 session id：用作目录名，杜绝路径穿越。
_SAFE_ID = re.compile(r'^[A-Za-z0-9_-]{1,64}$')

# 全局单飞锁：同一 compute 进程内一次只跑一个 DSH agent。
_LOCK = threading.Lock()

# SDK 懒加载：避免未安装依赖时影响服务启动。
_SDK: Any = None
_SDK_ERR: Optional[str] = None

# 关闭 shell 工具与会话日志外传的 profile patch。
# 说明：patch 覆盖同 id 行；disabled=true 让该行不挂载，模型看不到对应工具。
_SAFETY_PATCH = """\
- id: persistent-bash
  disabled: true
- id: persistent-pwsh
  disabled: true
- id: terminal-bash
  disabled: true
- id: terminal-pwsh
  disabled: true
- id: session-log-deepseek
  config:
    enabled: false
- id: tool-fs
  config:
    read: false
    readImage: false
    write: false
    edit: false
"""


def _load_sdk():
    global _SDK, _SDK_ERR
    if _SDK is not None:
        return _SDK
    if _SDK_ERR is not None:
        raise RuntimeError(_SDK_ERR)
    try:
        from deepseek_harness import DeepSeekHarness  # type: ignore
        _SDK = DeepSeekHarness
        return _SDK
    except Exception as e:  # noqa: BLE001
        _SDK_ERR = f'deepseek-harness-sdk 未安装或不可用：{e}'
        raise RuntimeError(_SDK_ERR)


def available() -> bool:
    try:
        _load_sdk()
        return True
    except Exception:  # noqa: BLE001
        return False


def status() -> dict:
    try:
        _load_sdk()
        return {'ok': True, 'available': True}
    except Exception as e:  # noqa: BLE001
        return {'ok': False, 'available': False, 'error': str(e)}


def _safe_session(session_id: Optional[str]) -> str:
    sid = (session_id or '').strip()
    if not sid:
        return uuid.uuid4().hex
    if not _SAFE_ID.match(sid):
        raise ValueError('session_id 只允许字母、数字、下划线与连字符（1-64 位）')
    return sid


def run_agent(
    prompt: str,
    session_id: Optional[str] = None,
    api_key: Optional[str] = None,
    base_url: Optional[str] = None,
    model: Optional[str] = None,
    timeout_seconds: int = 300,
) -> dict:
    """同步执行一次 DSH agent 任务；返回 {ok, session_id, final_response, finish_reason}。

    调用方应放在线程池中执行（FastAPI run_in_threadpool），避免阻塞事件循环。
    """
    text = (prompt or '').strip()
    if not text:
        raise ValueError('prompt 不能为空')
    Harness = _load_sdk()

    sid = _safe_session(session_id)
    home = _HOME_ROOT / sid
    workspace = _WORKSPACE_ROOT / sid
    home.mkdir(parents=True, exist_ok=True)
    workspace.mkdir(parents=True, exist_ok=True)
    patch = home / 'aeolus-safety.patch.yml'
    patch.write_text(_SAFETY_PATCH, encoding='utf-8')

    if not _LOCK.acquire(blocking=False):
        raise RuntimeError('AI 助手正忙：同一时间只支持一个任务（服务器资源限制）')
    try:
        kwargs: dict[str, Any] = {
            'dsh_home': str(home),
            'cwd': str(workspace),
            'profile': 'sdk-minimal',
            'provider': 'deepseek-official',
            'model': model or 'deepseek-v4-flash',
            'request_timeout_seconds': max(1, int(timeout_seconds)),
            'patches': (str(patch),),
        }
        if api_key:
            kwargs['api_key'] = api_key
        if base_url:
            kwargs['base_url'] = base_url
        with Harness(**kwargs) as harness:
            result = harness.run(text, session_id=sid)
        final = getattr(result, 'final_response', '') or ''
        finish = getattr(result, 'finish_reason', None)
        if finish == 'error':
            return {
                'ok': False,
                'session_id': sid,
                'error': final or '模型请求失败（finish_reason=error），请检查密钥与模型配置',
                'finish_reason': finish,
            }
        return {
            'ok': True,
            'session_id': sid,
            'final_response': final,
            'finish_reason': finish,
        }
    finally:
        _LOCK.release()
