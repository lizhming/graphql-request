import gql from 'graphql-tag'
import { GraphQLClient, rawRequest, request } from '../src'
import { setupTestServer } from './__helpers'
import * as Dom from '../src/types.dom'
import { beforeEach, describe, expect, it, test, Mock, vitest } from 'vitest'

const ctx = setupTestServer()

test('minimal query', async () => {
  const { data } = ctx.res({
    body: {
      data: {
        me: {
          id: 'some-id',
        },
      },
    },
  }).spec.body!

  expect(await request(ctx.url, `{ me { id } }`)).toEqual(data)
})

test('minimal raw query', async () => {
  const { extensions, data } = ctx.res({
    body: {
      data: {
        me: {
          id: 'some-id',
        },
      },
      extensions: {
        version: '1',
      },
    },
  }).spec.body!
  const { headers, ...result } = await rawRequest(ctx.url, `{ me { id } }`)
  expect(result).toEqual({ data, extensions, status: 200 })
})

test('minimal raw query with response headers', async () => {
  const { headers: reqHeaders, body } = ctx.res({
    headers: {
      'Content-Type': 'application/json',
      'X-Custom-Header': 'test-custom-header',
    },
    body: {
      data: {
        me: {
          id: 'some-id',
        },
      },
      extensions: {
        version: '1',
      },
    },
  }).spec

  const { headers, ...result } = await rawRequest(ctx.url, `{ me { id } }`)

  expect(result).toEqual({ ...body, status: 200 })
  expect(headers.get('X-Custom-Header')).toEqual(reqHeaders!['X-Custom-Header'])
})

test('minimal raw query with response headers and new graphql content type', async () => {
  const { headers: reqHeaders, body } = ctx.res({
    headers: {
      'Content-Type': 'application/graphql+json',
    },
    body: {
      data: {
        me: {
          id: 'some-id',
        },
      },
      extensions: {
        version: '1',
      },
    },
  }).spec

  const { headers, ...result } = await rawRequest(ctx.url, `{ me { id } }`)

  expect(result).toEqual({ ...body, status: 200 })
})

test('minimal raw query with response headers and application/graphql-response+json response type', async () => {
  const { headers: reqHeaders, body } = ctx.res({
    headers: {
      'Content-Type': 'application/graphql-response+json',
    },
    body: {
      data: {
        me: {
          id: 'some-id',
        },
      },
      extensions: {
        version: '1',
      },
    },
  }).spec

  const { headers, ...result } = await rawRequest(ctx.url, `{ me { id } }`)

  expect(result).toEqual({ ...body, status: 200 })
})

test('content-type with charset', async () => {
  const { data } = ctx.res({
    // headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: {
      data: {
        me: {
          id: 'some-id',
        },
      },
    },
  }).spec.body!

  expect(await request(ctx.url, `{ me { id } }`)).toEqual(data)
})

test('basic error', async () => {
  ctx.res({
    body: {
      errors: {
        message: 'Syntax Error GraphQL request (1:1) Unexpected Name "x"\n\n1: x\n   ^\n',
        locations: [
          {
            line: 1,
            column: 1,
          },
        ],
      },
    },
  })

  const res = await request(ctx.url, `x`).catch((x) => x)

  expect(res).toMatchInlineSnapshot(
    `[Error: GraphQL Error (Code: 200): {"response":{"errors":{"message":"Syntax Error GraphQL request (1:1) Unexpected Name \\"x\\"\\n\\n1: x\\n   ^\\n","locations":[{"line":1,"column":1}]},"status":200,"headers":{}},"request":{"query":"x"}}]`
  )
})

test('basic error with raw request', async () => {
  ctx.res({
    body: {
      errors: {
        message: 'Syntax Error GraphQL request (1:1) Unexpected Name "x"\n\n1: x\n   ^\n',
        locations: [
          {
            line: 1,
            column: 1,
          },
        ],
      },
    },
  })
  const res = await rawRequest(ctx.url, `x`).catch((x) => x)
  expect(res).toMatchInlineSnapshot(
    `[Error: GraphQL Error (Code: 200): {"response":{"errors":{"message":"Syntax Error GraphQL request (1:1) Unexpected Name \\"x\\"\\n\\n1: x\\n   ^\\n","locations":[{"line":1,"column":1}]},"status":200,"headers":{}},"request":{"query":"x"}}]`
  )
})

describe('middleware', () => {
  let client: GraphQLClient
  let requestMiddleware: Mock
  let responseMiddleware: Mock

  describe('successful requests', () => {
    beforeEach(() => {
      ctx.res({
        body: {
          data: {
            result: 123,
          },
        },
      })

      requestMiddleware = vitest.fn((req) => ({ ...req }))
      responseMiddleware = vitest.fn()
      client = new GraphQLClient(ctx.url, {
        requestMiddleware,
        responseMiddleware,
      })
    })

    it('request', async () => {
      const requestPromise = client.request<{ result: number }>(`x`)
      expect(requestMiddleware).toBeCalledTimes(1)
      const res = await requestPromise
      expect(responseMiddleware).toBeCalledTimes(1)
      expect(res.result).toBe(123)
    })

    it('rawRequest', async () => {
      const requestPromise = client.rawRequest<{ result: number }>(`x`)
      expect(requestMiddleware).toBeCalledTimes(1)
      await requestPromise
      expect(responseMiddleware).toBeCalledTimes(1)
    })

    it('batchRequests', async () => {
      const requestPromise = client.batchRequests<{ result: number }>([{ document: `x` }])
      expect(requestMiddleware).toBeCalledTimes(1)
      await requestPromise
      expect(responseMiddleware).toBeCalledTimes(1)
    })

    it('url changes', async () => {
      requestMiddleware = vitest.fn((req) => ({ ...req, url: ctx.url }))
      const _client = new GraphQLClient('https://graphql.org', {
        requestMiddleware,
      })
      const requestPromise = _client.request<{ result: number }>(`x`)
      const res = await requestPromise
      expect(requestMiddleware).toBeCalledTimes(1)
      expect(res.result).toBe(123)
    })
  })

  describe('async request middleware', () => {
    beforeEach(() => {
      ctx.res({
        body: {
          data: {
            result: 123,
          },
        },
      })

      requestMiddleware = vitest.fn(async (req) => ({ ...req }))
      client = new GraphQLClient(ctx.url, {
        requestMiddleware,
      })
    })

    it('request', async () => {
      const requestPromise = client.request<{ result: number }>(`x`)
      expect(requestMiddleware).toBeCalledTimes(1)
      await requestPromise
    })

    it('rawRequest', async () => {
      const requestPromise = client.rawRequest<{ result: number }>(`x`)
      expect(requestMiddleware).toBeCalledTimes(1)
      await requestPromise
    })

    it('batchRequests', async () => {
      const requestPromise = client.batchRequests<{ result: number }>([{ document: `x` }])
      expect(requestMiddleware).toBeCalledTimes(1)
      await requestPromise
    })
  })

  describe('failed requests', () => {
    beforeEach(() => {
      ctx.res({
        body: {
          errors: {
            message: 'Syntax Error GraphQL request (1:1) Unexpected Name "x"\n\n1: x\n   ^\n',
            locations: [
              {
                line: 1,
                column: 1,
              },
            ],
          },
        },
      })

      requestMiddleware = vitest.fn((req) => ({ ...req }))
      responseMiddleware = vitest.fn()
      client = new GraphQLClient(ctx.url, {
        requestMiddleware,
        responseMiddleware,
      })
    })

    it('request', async () => {
      const requestPromise = client.request<{ result: number }>(`x`)
      expect(requestMiddleware).toBeCalledTimes(1)
      await expect(requestPromise).rejects.toThrowError()
      expect(responseMiddleware).toBeCalledTimes(1)
    })

    it('rawRequest', async () => {
      const requestPromise = client.rawRequest<{ result: number }>(`x`)
      expect(requestMiddleware).toBeCalledTimes(1)
      await expect(requestPromise).rejects.toThrowError()
      expect(responseMiddleware).toBeCalledTimes(1)
    })

    it('batchRequests', async () => {
      const requestPromise = client.batchRequests<{ result: number }>([{ document: `x` }])
      expect(requestMiddleware).toBeCalledTimes(1)
      await expect(requestPromise).rejects.toThrowError()
      expect(responseMiddleware).toBeCalledTimes(1)
    })
  })
})

// todo needs to be tested in browser environment
// the options under test here aren't used by node-fetch
test.skip('extra fetch options', async () => {
  const options: RequestInit = {
    credentials: 'include',
    mode: 'cors',
    cache: 'reload',
  }

  const client = new GraphQLClient(ctx.url, options)
  const { requests } = ctx.res({
    body: { data: { test: 'test' } },
  })
  await client.request('{ test }')
  expect(requests).toMatchInlineSnapshot(`
    Array [
      Object {
        "body": Object {
          "query": "{ test }",
        },
        "headers": Object {
          "accept": "*/*",
          "accept-encoding": "gzip,deflate",
          "connection": "close",
          "content-length": "20",
          "content-type": "application/json",
          "host": "localhost:3210",
          "user-agent": "node-fetch/1.0 (+https://github.com/bitinn/node-fetch)",
        },
        "method": "POST",
      },
    ]
  `)
})

test('case-insensitive content-type header for custom fetch', async () => {
  const testData = { data: { test: 'test' } }
  const testResponseHeaders = new Map()
  testResponseHeaders.set('ConTENT-type', 'apPliCatiON/JSON')

  const options: Dom.RequestInit = {
    fetch: function (url: string) {
      return Promise.resolve({
        headers: testResponseHeaders,
        data: testData,
        json: function () {
          return testData
        },
        text: function () {
          return JSON.stringify(testData)
        },
        ok: true,
        status: 200,
        url,
      })
    },
  }

  const client = new GraphQLClient(ctx.url, options)
  const result = await client.request('{ test }')

  expect(result).toEqual(testData.data)
})

describe('operationName parsing', () => {
  it('should work for gql documents', async () => {
    const mock = ctx.res({ body: { data: { foo: 1 } } })
    await request(
      ctx.url,
      gql`
        query myGqlOperation {
          users
        }
      `
    )

    const requestBody = mock.requests[0].body
    expect(requestBody.operationName).toEqual('myGqlOperation')
  })

  it('should work for string documents', async () => {
    const mock = ctx.res({ body: { data: { foo: 1 } } })
    await request(
      ctx.url,
      `
        query myStringOperation {
          users
        }
      `
    )

    const requestBody = mock.requests[0].body
    expect(requestBody.operationName).toEqual('myStringOperation')
  })
})
