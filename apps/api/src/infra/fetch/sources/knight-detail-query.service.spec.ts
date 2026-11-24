import { KnightDetailQueryService } from './knight-detail-query.service';

function jsonResponse(body: any, status = 200): any {
  return { status, ok: status < 400, json: async () => body };
}

const page = (rows: any[], count = rows.length) => ({
  err_code: '200',
  code: '200',
  msg: '',
  data: { count, list: rows },
});

const makeCookies = () => ({
  ensure: jest.fn().mockResolvedValue('old-cookie'),
  relogin: jest.fn().mockResolvedValue('fresh-cookie'),
});

const makePace = () => ({
  bump: jest.fn(),
  reward: jest.fn(),
  penalize: jest.fn(),
  penalizeNet: jest.fn(),
  isThrottle: jest.fn((e: unknown) => /FREQUENT|频繁/.test(String((e as Error)?.message ?? e))),
  backoffSleep: jest.fn().mockResolvedValue(undefined),
  pageSleep: jest.fn().mockResolvedValue(undefined),
  coarseSleep: jest.fn().mockResolvedValue(undefined),
  statsReset: jest.fn(),
  statsSnapshot: jest.fn().mockReturnValue({ requests: 1, ok: 1 }),
  persistFloor: jest.fn(),
});

const originalFetch = global.fetch;
afterEach(() => {
  (global as any).fetch = originalFetch;
  jest.restoreAllMocks();
});

describe('KnightDetailQueryService', () => {
  it('单页查询下推姓名/站点/在职状态，并返回上游原生行与公共字典列定义', async () => {
    const cookies = makeCookies();
    const pace = makePace();
    const svc = new KnightDetailQueryService(cookies as any, pace as any);
    const fetchMock = jest
      .fn()
      .mockResolvedValue(jsonResponse(page([{ knightId: 1, staffName: '张三' }], 7)));
    (global as any).fetch = fetchMock;

    const out = await svc.queryKnights({
      pageIndex: '2',
      pageSize: '500',
      staffName: ' 张三 ',
      departmentId: '917521130',
      workStatus: '1',
    });

    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('pageIndex=2');
    expect(url).toContain('pageSize=500');
    expect(url).toContain('staffName=%E5%BC%A0%E4%B8%89');
    expect(url).toContain('departmentId=917521130');
    expect(url).toContain('workStatus=1');
    expect(out.total).toBe(7);
    expect(out.page_index).toBe(2);
    expect(out.rows[0]).toEqual({ knightId: 1, staffName: '张三' });
    expect(out.columns.some((c) => c.key === 'staffName' && c.label === '骑手姓名')).toBe(true);
  });

  it('会话失效（403 + 请重新登录）时强制重登并重试', async () => {
    const cookies = makeCookies();
    const pace = makePace();
    const svc = new KnightDetailQueryService(cookies as any, pace as any);
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ code: '400', msg: 'token为空，请重新登录' }, 403),
      )
      .mockResolvedValueOnce(jsonResponse(page([{ knightId: 9, staffName: '李四' }], 1)));
    (global as any).fetch = fetchMock;

    const out = await svc.queryKnights({});

    expect(cookies.relogin).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1].headers.cookie).toBe('fresh-cookie');
    expect(out.rows[0]['staffName']).toBe('李四');
  });

  it('全量查询自动翻页，按 knightId 去重', async () => {
    const cookies = makeCookies();
    const pace = makePace();
    const svc = new KnightDetailQueryService(cookies as any, pace as any);
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(page([{ knightId: 1 }, { knightId: 2 }], 3)),
      )
      .mockResolvedValueOnce(
        jsonResponse(page([{ knightId: 2 }, { knightId: 3 }], 3)),
      );
    (global as any).fetch = fetchMock;

    const out = await svc.queryAllKnights({ pageSize: 2 });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toContain('pageIndex=2');
    expect(out.total).toBe(3);
    expect(out.upstream_total).toBe(3);
    expect(out.rows.map((r) => r['knightId'])).toEqual([1, 2, 3]);
    expect(out.truncated).toBe(false);
  });

  it('非法数值过滤参数直接报错，不静默丢弃', async () => {
    const svc = new KnightDetailQueryService(makeCookies() as any, makePace() as any);
    await expect(svc.queryKnights({ departmentId: 'abc' })).rejects.toThrow(/department_id/);
  });
});
