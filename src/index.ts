declare module 'koishi' {
  interface Events {
    'opencode/error'(sessionId: string, error: any): void
    'opencode/activity'(sessionId: string): void
    'opencode/status'(sessionId: string, status: string): void
  }
}

import { Context, Schema, h } from 'koishi'

export const name = 'opencode'

async function initializeClients(config: Config): Promise<{ main: any; health: any }> {
  const { createOpencodeClient: createV1 } = await import('@opencode-ai/sdk/client')
  const { createOpencodeClient: createV2 } = await import('@opencode-ai/sdk/v2/client')

  return {
    main: createV1({ baseUrl: config.baseUrl }),
    health: createV2({ baseUrl: config.baseUrl }),
  }
}

export interface Config {
  baseUrl: string
  defaultSession?: string
  model?: string
  authority?: number
  timeout?: number
}

export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    baseUrl: Schema.string().default('http://localhost:4096').description('OpenCode Server 地址'),
    defaultSession: Schema.string().description('默认会话 ID'),
    model: Schema.string().description('覆盖默认模型 (格式: provider/model)'),
    timeout: Schema.number().default(30000).description('生成超时时间 (毫秒)'),
  }).description('OpenCode 连接配置'),
  Schema.object({
    authority: Schema.number().default(1).description('使用命令所需权限等级'),
  }).description('权限配置'),
])

const sessionCache = new Map<string, string>()

export function apply(ctx: Context, config: Config) {
  let client: any = null
  let healthClient: any = null

  ctx.logger.info(`OpenCode 插件正在初始化，连接至: ${config.baseUrl}`)

  const clientPromise = initializeClients(config).then(clients => {
    client = clients.main
    healthClient = clients.health
    ctx.logger.info(`OpenCode 客户端已初始化`)
    return clients
  }).catch(err => {
    ctx.logger.error(`OpenCode 客户端初始化失败:`, err)
    throw err
  })



  ctx.command('oc.models [keyword:text]', {
    authority: config.authority || 1,
  })
    .alias('oc.m')
    .action(async (_, keyword) => {
      try {
        const c = await ensureClient()
        const { data } = await c.config.providers()
        const providerList: string[] = []

        if (data.providers) {
          const kw = keyword ? keyword.toLowerCase() : ''

          for (const provider of data.providers) {
            const models = provider.models
              ? (Array.isArray(provider.models) ? provider.models : Object.values(provider.models))
              : []

            // Filter models: include if model matches OR if provider matches (then include all models of that provider? No, maybe just matching ones unless intent is provider search)
            // Better: Include model if (model.name/id matches) OR (provider.name/id matches)
            const matchedModels = models.filter((m: any) => {
              if (!kw) return true
              const pMatch = (provider.name || '').toLowerCase().includes(kw) || provider.id.toLowerCase().includes(kw)
              const mMatch = (m.name || '').toLowerCase().includes(kw) || m.id.toLowerCase().includes(kw)
              return pMatch || mMatch
            })

            if (matchedModels.length > 0) {
              providerList.push(`📦 [${provider.name || provider.id}]\n` + matchedModels.map((m: any) => `  - ${provider.id}/${m.id}: ${m.name || m.id}`).join('\n'))
            }
          }
        }

        if (providerList.length === 0) return keyword ? `❌ 未找到包含 "${keyword}" 的模型` : '未找到可用模型'
        return providerList.join('\n\n')
      } catch (error) {
        ctx.logger.error('获取模型列表失败:', error)
        return '❌ 获取模型列表失败'
      }
    })

  ctx.command('oc.model.set <model:string>', {
    authority: config.authority || 3,
  })
    .alias('oc.ms')
    .action(async ({ session }, model) => {
      try {
        if (!model) return '❌ 请提供模型 ID (例如: anthropic/claude-3-5-sonnet)'

        // Simple validation
        if (!model.includes('/')) {
          return '❌ 模型 ID 格式应为 provider/model'
        }

        // Verify validity (optional, but good UX)
        const c = await ensureClient()
        const { data } = await c.config.providers()
        let isValid = false

        if (data.providers) {
          for (const p of data.providers) {
            const pId = p.id
            // check if model starts with provider id
            if (model.startsWith(pId + '/')) {
              // strict check
              const mId = model.split('/')[1]
              const models = Array.isArray(p.models) ? p.models : Object.values(p.models || {})
              if (models.some(m => m.id === mId)) {
                isValid = true
                break
              }
            }
          }
        }

        if (!isValid) {
          return `⚠️ 警告: 未在当前可用列表中找到模型 "${model}"，但仍将强制设置。`
        }

        // Update config
        // ctx.scope.update triggers reload
        await ctx.scope.update((config) => {
          config.model = model
        })

        return `✅ 已将默认模型设置为: ${model} (插件重载中...)`
      } catch (error) {
        ctx.logger.error('设置模型失败:', error)
        return '❌ 设置模型失败'
      }
    })

  const ensureClient = async () => {
    if (!client) {
      await clientPromise
    }
    return client
  }

  const ensureHealthClient = async () => {
    if (!healthClient) {
      await clientPromise
    }
    return healthClient
  }

  ctx.command('oc <message:text>', {
    authority: config.authority || 1,
  })
    .action(async ({ session }, message) => {
      try {
        const c = await ensureClient()
        const sessionId = getSessionId(session, config.defaultSession)
        const opencodeSession = await getOrCreateSession(c, sessionId)

        ctx.logger.info(`[${opencodeSession.id}] 发送消息: ${message.substring(0, 50)}...`)

        let capturedError: any = null
        let lastActivity = Date.now()
        let currentStatus = 'idle'

        const removeListeners = [
          ctx.on('opencode/error', (sid, err) => {
            if (sid === opencodeSession.id) capturedError = err
          }),
          ctx.on('opencode/activity', (sid) => {
            if (sid === opencodeSession.id) lastActivity = Date.now()
          }),
          ctx.on('opencode/status', (sid, status) => {
            if (sid === opencodeSession.id) {
              currentStatus = status
              lastActivity = Date.now()
            }
          })
        ]

        try {
          // Construct message with context
          const senderName = session.username || session.author?.name || session.userId
          const contextHeader = `[User: ${senderName} (ID: ${session.userId}) | Platform: ${session.platform}]`
          const fullMessage = `${contextHeader}\n${message}`

          const result = await c.session.prompt({
            path: { id: opencodeSession.id },
            body: {
              model: config.model ? parseModel(config.model) : undefined,
              parts: [{ type: 'text', text: fullMessage }],
            },
          })

          // Assume busy after prompt
          lastActivity = Date.now()
          currentStatus = 'busy'
          const targetMsgId = result.info?.id

          ctx.logger.info(`等待消息生成: ${targetMsgId} (超时: ${config.timeout || 30000}ms)`)

          // Poll loop
          const timeout = config.timeout || 30000

          while (true) {
            if (capturedError) break

            if (Date.now() - lastActivity > timeout) {
              ctx.logger.warn(`[${opencodeSession.id}] 响应生成超时`)
              break
            }

            await new Promise(resolve => setTimeout(resolve, 200))

            // If idle and stable for 1s, we are done
            if (currentStatus === 'idle' && Date.now() - lastActivity > 1000) {
              break
            }
          }

          if (capturedError) {
            const errData = capturedError.data as { message?: string } | undefined
            const errMessage = errData?.message || capturedError.message || JSON.stringify(capturedError)
            return `❌ ${errMessage}`
          }

          // Fetch final message content
          const { data: messages } = await c.session.messages({
            path: { id: opencodeSession.id }
          })

          // Find our message by ID to ensure we have the latest parts
          let responseParts: any[] = []

          if (targetMsgId) {
            const found = messages.find((m: any) => m.info.id === targetMsgId)
            if (found) {
              responseParts = found.parts || []
            } else {
              // Fallback: use the last message if ID not found (unlikely)
              responseParts = messages[messages.length - 1]?.parts || []
            }
          } else {
            // Fallback
            responseParts = messages[messages.length - 1]?.parts || []
          }

          const textParts = responseParts
            .filter((p: any) => p.type === 'text')
            .map((p: any) => p.text)
            .join('\n')

          let formattedResponse = textParts || '[无响应]'

          if (responseParts.some((p: any) => p.type === 'code')) {
            formattedResponse += '\n\n*包含代码块*'
          }

          if (textParts.length === 0 && !capturedError) {
            formattedResponse = '[无响应 - 可能是生成超时或需要更多时间]'
          }

          return formattedResponse

        } finally {
          removeListeners.forEach(off => off())
        }

      } catch (error) {
        const errorMsg = (error as Error).message || String(error)
        ctx.logger.error('OpenCode 错误:', errorMsg)
        return h.text(`❌ OpenCode 错误: ${errorMsg}`)
      }
    })

  ctx.command('oc.session.list', {
    authority: config.authority || 3,
  })
    .alias('oc.sl')
    .action(async () => {
      try {
        const c = await ensureClient()
        const { data: sessions } = await c.session.list()

        if (sessions.length === 0) {
          return '暂无会话'
        }

        const list = sessions.map(s =>
          `${s.id}: ${s.title || '未命名'} ${s.model ? `(${s.model})` : ''}`
        ).join('\n')

        return `📋 会话列表:\n${list}`

      } catch (error) {
        ctx.logger.error('列出会话失败:', error)
        return '❌ 列出会话失败'
      }
    })

  ctx.command('oc.session.new', {
    authority: config.authority || 3,
  })
    .alias('oc.sn')
    .action(async ({ session }) => {
      try {
        const c = await ensureClient()
        const { data: newSession } = await c.session.create({
          body: {
            title: `Koishi-${session.platform}-${session.userId || Date.now()}`,
          },
        })

        const sessionId = getSessionId(session)
        sessionCache.set(sessionId, newSession.id)

        return `✅ 已创建会话: ${newSession.id}\n📝 标题: ${newSession.title}`

      } catch (error) {
        ctx.logger.error('创建会话失败:', error)
        return '❌ 创建会话失败'
      }
    })

  ctx.command('oc.session.set <id:string>', {
    authority: config.authority || 2,
  })
    .alias('oc.ss')
    .action(async ({ session }, id) => {
      try {
        const c = await ensureClient()
        const { data: sessions } = await c.session.list()
        const targetSession = sessions.find(s => s.id === id)

        if (!targetSession) {
          return `❌ 会话 ${id} 不存在`
        }

        const sessionId = getSessionId(session)
        sessionCache.set(sessionId, id)

        return `✅ 已切换到会话: ${id}\n📝 标题: ${targetSession.title}`

      } catch (error) {
        ctx.logger.error('切换会话失败:', error)
        return '❌ 切换会话失败'
      }
    })

  ctx.command('oc.session.info', {
    authority: config.authority || 1,
  })
    .alias('oc.si')
    .action(async ({ session }) => {
      try {
        const c = await ensureClient()
        const sessionId = getSessionId(session, config.defaultSession)
        const opencodeSession = await c.session.get({
          path: { id: sessionId },
        })

        return `📌 当前会话信息:\n` +
          `ID: ${opencodeSession.id}\n` +
          `标题: ${opencodeSession.title || '未命名'}\n` +
          `模型: ${opencodeSession.model || '默认'}\n` +
          `创建时间: ${opencodeSession.createdAt ? new Date(opencodeSession.createdAt).toLocaleString() : '未知'}`

      } catch (error) {
        ctx.logger.error('获取会话信息失败:', error)
        return '❌ 获取会话信息失败'
      }
    })

  ctx.command('oc.session.delete <id:string>', {
    authority: config.authority || 4,
  })
    .alias('oc.sdel')
    .action(async (_, id) => {
      try {
        const c = await ensureClient()
        await c.session.delete({ path: { id } })

        for (const [key, value] of sessionCache.entries()) {
          if (value === id) {
            sessionCache.delete(key)
          }
        }

        return `✅ 已删除会话: ${id}`

      } catch (error) {
        ctx.logger.error('删除会话失败:', error)
        return '❌ 删除会话失败'
      }
    })

  ctx.command('oc.health', {
    authority: config.authority || 1,
  })
    .alias('oc.h')
    .action(async () => {
      try {
        const hc = await ensureHealthClient()
        const { data: health } = await hc.global.health()

        return `🏥 OpenCode 状态:\n` +
          `健康: ${health.healthy ? '✅ 正常' : '❌ 异常'}\n` +
          `版本: ${health.version || '未知'}`

      } catch (error) {
        ctx.logger.error('健康检查失败:', error)
        return '❌ 无法连接到 OpenCode'
      }
    })

  clientPromise.then(() => {
    setupEventStream(client, ctx)
  })
}

function getSessionId(session: any, defaultId?: string): string {
  const cacheKey = `${session.platform}-${session.userId}`
  const cached = sessionCache.get(cacheKey)

  if (cached) return cached
  if (defaultId) return defaultId

  return `koishi-${session.platform}-${session.userId || 'default'}`
}

async function getOrCreateSession(
  client: any,
  sessionId: string
): Promise<any> {
  try {
    const result = await client.session.get({ path: { id: sessionId } })
    if (result.data && result.data.id) {
      return result.data
    }
  } catch {
    // v1 SDK doesn't throw errors, returns error object instead
  }

  const result = await client.session.create({
    body: {
      id: sessionId,
      title: `Koishi-${sessionId}`,
    },
  })
  return result.data
}

function parseModel(modelStr: string): { providerID: string; modelID: string } {
  const parts = modelStr.split('/')
  if (parts.length !== 2) {
    throw new Error(`模型格式错误，应为: provider/model (例如: anthropic/claude-3-5-sonnet-20241022)`)
  }
  return { providerID: parts[0], modelID: parts[1] }
}

async function setupEventStream(client: any, ctx: Context) {
  let isDisposed = false
  const dispose = ctx.on('dispose', () => {
    isDisposed = true
  })

  try {
    const events = await client.event.subscribe()

    for await (const event of events.stream) {
      if (isDisposed) break

      // ctx.logger.debug('OpenCode 事件:', event.type, JSON.stringify(event.properties))

      switch (event.type) {
        case 'session.created':
          if (event.properties.info?.id) {
            ctx.logger.info(`会话创建: ${event.properties.info.id}`)
          }
          break
        case 'session.deleted':
          if (event.properties.info?.id) {
            ctx.logger.info(`会话删除: ${event.properties.info.id}`)
          }
          break
        case 'session.updated':
          ctx.logger.debug(`会话更新: ${event.properties.info?.id || 'unknown'}`)
          break
        case 'message.part.updated':
          const partText = event.properties.part?.text ? ` 内容: ${event.properties.part.text.substring(0, 50)}...` : ''
          ctx.logger.info(`消息生成中 [${event.type}]${partText}`)
          const mpSessionId = event.properties.sessionID || event.properties.info?.session_id || event.properties.info?.sessionId
          if (mpSessionId) ctx.emit('opencode/activity', mpSessionId)
          break
        case 'message.updated':
          ctx.logger.info(`消息更新 [${event.type}] ID: ${event.properties.info?.id}`)
          const mSessionId = event.properties.sessionID || event.properties.info?.session_id || event.properties.info?.sessionId
          if (mSessionId) ctx.emit('opencode/activity', mSessionId)
          break
        case 'session.status':
          const statusType = event.properties.status?.type || 'unknown'
          ctx.logger.info(`会话状态变更: ${statusType}`)
          const sSessionId = event.properties.sessionID || event.properties.info?.id
          if (sSessionId) {
            ctx.emit('opencode/status', sSessionId, statusType)
            ctx.emit('opencode/activity', sSessionId)
          }
          break
        case 'session.diff':
          // Diff events can be verbose, keep in debug
          ctx.logger.debug(`会话差异更新 [${event.type}]`)
          const dSessionId = event.properties.sessionID || event.properties.info?.id
          if (dSessionId) ctx.emit('opencode/activity', dSessionId)
          break
        case 'session.idle':
        case 'server.heartbeat':
          ctx.logger.debug(`事件: ${event.type}`)
          break
        case 'session.error':
          const errData = event.properties.error?.data as { message?: string } | undefined
          const errMessage = errData?.message || event.properties.error?.message || JSON.stringify(event.properties.error)
          ctx.logger.warn(`会话错误: ${errMessage}`)

          if (event.properties.sessionID) {
            ctx.emit('opencode/error', event.properties.sessionID, event.properties.error)
          }
          break
        case 'tui.toast.show':
          ctx.logger.info(`Toast: ${event.properties.message}`)
          break
        default:
          ctx.logger.info(`OpenCode 事件 [${event.type}]: ${JSON.stringify(event.properties)}`)
      }
    }
  } catch (error) {
    if (!isDisposed) {
      ctx.logger.warn('事件流监听中断:', error)
    }
  } finally {
    dispose()
  }
}
