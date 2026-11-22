import { ViolationFetchService } from './violation-fetch.service';
import { ViolationListFetchService } from './violation-list-fetch.service';

function jsonResponse(body: any, status = 200): any {
  return { status, ok: status < 400, json: async () => body };
}

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
});

const originalFetch = global.fetch;
afterEach(() => {
  (global as any).fetch = originalFetch;
  jest.restoreAllMocks();
});

describe('ViolationFetchService', () => {
  it('会话失效时强制重登并重试一次', async () => {
    const cookies = makeCookies();
    const svc = new ViolationFetchService(cookies as any);
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ result: null, error: { name: 'UNAUTHORIZED', message: '未登录' } }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ result: { code: '200', data: { fileUrl: 'https://oss.example/x.csv' } } }),
      )
      .mockResolvedValueOnce({ arrayBuffer: async () => Buffer.from('a,b\n1,2') } as any);
    (global as any).fetch = fetchMock;

    const out = await svc.downloadCsv(1, 2);

    expect(cookies.relogin).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(out.text).toBe('a,b\n1,2');
    expect(out.fileUrl).toBe('https://oss.example/x.csv');
  });

  it('显式传入 cookie 时会话失效不重登', async () => {
    const cookies = makeCookies();
    const svc = new ViolationFetchService(cookies as any);
    (global as any).fetch = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ result: null, error: { name: 'UNAUTHORIZED', message: '未登录' } }),
      );

    await expect(svc.downloadCsv(1, 2, 'manual-cookie')).rejects.toThrow(/未登录/);
    expect(cookies.relogin).not.toHaveBeenCalled();
  });
});

describe('ViolationListFetchService', () => {
  const result = (data: any) => jsonResponse({ result: { code: '200', data } });

  it('下推站点/骑手，并按公共字典归一后按违规编号去重', async () => {
    const cookies = makeCookies();
    const pace = makePace();
    const svc = new ViolationListFetchService(cookies as any, pace as any);
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(result({ total: 2, data: [] }))
      .mockResolvedValueOnce(
        result({
          total: 2,
          data: [
            { violationOrderId: 'V1', 团队ID: '9' },
            { 违规编号: 'V1', 团队ID: '9' },
          ],
        }),
      );
    (global as any).fetch = fetchMock;

    const out = await svc.queryRange(1, 2, 200, undefined, { teamIds: '9', rider: '张三' });

    expect(out.total).toBe(1);
    expect(out.rows[0]['违规编号']).toBe('V1');
    const body = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(body.params.request.teamIds).toEqual([9]);
    expect(body.params.request.knightInfo).toBe('张三');
  });

  it('命中限流时退避重试而非直接失败', async () => {
    const cookies = makeCookies();
    const pace = makePace();
    const svc = new ViolationListFetchService(cookies as any, pace as any);
    const fetchMock = jest
      .fn()
      .mockRejectedValueOnce(new Error('FREQUENT'))
      .mockResolvedValueOnce(result({ total: 0, data: [] }));
    (global as any).fetch = fetchMock;

    await expect(svc.queryList(1, 2, 1, 10)).resolves.toBeDefined();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(pace.penalize).toHaveBeenCalledTimes(1);
    expect(pace.backoffSleep).toHaveBeenCalled();
  });
});
