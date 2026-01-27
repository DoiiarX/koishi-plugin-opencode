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
  showReasoning?: boolean
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
    showReasoning: Schema.boolean().description('是否显示 agent 的推理过程').default(true),
  }).description('OpenCode 连接配置'),
  Schema.object({
    authority: Schema.number().default(1).description('使用命令所需权限等级'),
  }).description('权限配置'),
])

const sessionCache = new Map<string, string>()

interface SessionState {
  sessionId: string
  platform: string
  userId: string
  messageId: any
  channelId: string
  guildId?: string
  selfId: string
  opencodeMessageId?: string
  lastActivity?: number
  // cache for message parts: messageID -> { text?, reasoning? }
  partialMessages?: Map<string, { text?: string; reasoning?: string }>
  // track tool execution states: callID -> lastStatus
  toolStates?: Map<string, string>
}

const activeSessions = new Map<string, SessionState>()
const messageIdToSessionKey = new Map<string, string>()

// refer: https://github.com/anomalyco/opencode/blob/dev/packages/sdk/js/src/gen/types.gen.ts
function formatPart(part: any, showReasoning: boolean = true): string {
  if (!part) return '未知类型'

  switch (part.type) {
    case 'text':
      return part.text || ''

    case 'reasoning':
      if (showReasoning) {
        return `🤔 思考: ${part.text || ''}`
      }
      return ''

    case 'tool':
      const status = part.state?.status
      if (status === 'pending') return '' // Ignore pending

      const tool = part.tool
      const input = part.state?.input || {}
      const output = part.state?.output
      const metadata = part.state?.metadata || {}

      let header = ''
      if (status === 'completed') {
        header = `✅ 工具 ${tool} 执行完成`
      } else if (status === 'running') {
        header = `🔧 执行工具: ${tool}`
      } else {
        header = `🔧 工具 ${tool} (${status})`
      }

      let content = ''

      try {
        // Customizable formatting based on tool name
        if (tool === 'todowrite' && Array.isArray(input.todos)) {
          content = '\n' + input.todos.map((t: any) => {
            let mark = '[ ]'
            if (t.status === 'completed') mark = '[x]'
            else if (t.status === 'in_progress') mark = '[/]'
            return `${mark} ${t.content}`
          }).join('\n')
        }
        else if ((tool === 'edit' || tool === 'write' || tool === 'replace_file_content' || tool === 'multi_replace_file_content') && (input.filePath || input.TargetFile)) {
          const file = input.filePath || input.TargetFile || metadata.filepath
          if (file && !header.includes('(')) header += ` (${file})`

          if (metadata.diff) {
            content = `\n\`\`\`diff\n${metadata.diff}\n\`\`\``
          }
        }
        else if (tool === 'bash' || tool === 'run_command') {
          const cmd = input.command || input.CommandLine
          if (cmd) header += `\n$ ${cmd}`

          if (output) {
            // Heuristic: if command implies diff or output looks like diff/code
            const cmdStr = (cmd || '').trim().toLowerCase()
            if (cmdStr.startsWith('diff') || cmdStr.startsWith('fc') || (typeof output === 'string' && output.includes('diff --git'))) {
              content = `\n\`\`\`diff\n${output}\n\`\`\``
            } else {
              // Limit output length for other commands
              const outStr = String(output)
              content = `\n${outStr.length > 300 ? outStr.substring(0, 300) + '...' : outStr}`
            }
          }
        }
        // Fallback / Generic
        else {
          if (tool === 'webfetch' && input.url) header += ` (${input.url})`
          else if (tool === 'read' && input.filePath) header += ` (${input.filePath})`
          else if (tool === 'skill' && input.name) header += ` (${input.name})`

          // If we haven't generated valid content yet, try to show something generic if not already in header
          if (!content && !header.includes('(')) {
            const keys = Object.keys(input)
            if (keys.length === 1 && typeof input[keys[0]] === 'string') {
              header += ` (${input[keys[0]]})`
            } else if (keys.length > 0) {
              const inputStr = JSON.stringify(input)
              if (inputStr.length < 100) {
                // Only append if short
                header += ` ${inputStr}`
              }
            }
          }
        }
      } catch (e) {
        // Fallback if parsing fails
      }

      return header + content

    case 'step-start':
      return '' // Don't show step start to user

    case 'step-finish':
      if (part.success) {
        return `✅ 完成步骤: ${part.title || ''}`
      } else {
        return `❌ 失败: ${part.title || ''}`
      }

    case 'agent':
      return `🤖 子代理: ${part.name || '未命名'}`

    case 'subtask':
      return `� 子任务 (${part.agent}): ${part.description || part.prompt}`

    case 'patch':
      return `📦 补丁 (${part.hash}): ${part.files?.join(', ') || '无文件'}`

    case 'retry':
      const errorMsg = part.error?.data?.message || JSON.stringify(part.error) || ''
      return `🔄 重试 (${part.attempt}次): ${errorMsg}`

    case 'file':
      return `� 文件: ${part.filename || part.url || '未知文件'}`

    case 'snapshot':
    case 'compaction':
      return '' // Internal types, don't show to user

    default:
      return `📦 ${part.type}`
  }
}

export function apply(ctx: Context, config: Config) {
  let client: any = null
  let healthClient: any = null

  ctx.logger.info(`OpenCode 插件正在初始化，连接至: ${config.baseUrl}`)
  ctx.logger.info('showReasoning config:', config.showReasoning)
  const clientPromise = initializeClients(config).then(clients => {
    client = clients.main
    healthClient = clients.health
    ctx.logger.info(`OpenCode 客户端已初始化`)
    return clients
  }).catch(err => {
    ctx.logger.error(`OpenCode 客户端初始化失败:`, err)
    throw err
  })

  // Event stream setup
  clientPromise.then(() => {
    setupEventStream(client, ctx, config)
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
      const sessionKey = `${session.platform}-${session.userId}`

      try {
        const c = await ensureClient()
        const sessionId = getSessionId(session, config.defaultSession)
        const opencodeSession = await getOrCreateSession(c, sessionId)

        ctx.logger.info(`[${opencodeSession.id}] 发送消息: ${message.substring(0, 50)}...`)

        const senderName = session.username || session.author?.name || session.userId
        const contextHeader = `[User: ${senderName} (ID: ${session.userId}) | Platform: ${session.platform}]`
        const fullMessage = `${contextHeader}\n${message}`

        // Register session BEFORE prompt to avoid race conditions with incoming events
        activeSessions.set(sessionKey, {
          sessionId: opencodeSession.id,
          platform: session.platform,
          userId: session.userId,
          messageId: session.id,
          channelId: session.channelId,
          guildId: session.guildId,
          selfId: session.selfId,
          lastActivity: Date.now(),
          partialMessages: new Map(),
          toolStates: new Map()
        })
        ctx.logger.info(`会话已添加到活跃追踪: ${sessionKey}`)

        await session.send(`🔄 正在处理: ${message.substring(0, 30)}...`)

        const result = await c.session.prompt({
          path: { id: opencodeSession.id },
          body: {
            model: config.model ? parseModel(config.model) : undefined,
            parts: [{ type: 'text', text: fullMessage }],
          },
        })

        const targetMsgId = result.info?.id

        if (targetMsgId) {
          const state = activeSessions.get(sessionKey)
          if (state) {
            state.opencodeMessageId = targetMsgId
            state.lastActivity = Date.now() // Reset timeout timer after prompt returns
            activeSessions.set(sessionKey, state)
            messageIdToSessionKey.set(targetMsgId, sessionKey)
          }
        } else {
          // Even if no ID (shouldn't happen?), reset activity to give it a chance
          const state = activeSessions.get(sessionKey)
          if (state) {
            state.lastActivity = Date.now()
            activeSessions.set(sessionKey, state)
          }
        }

        const timeout = config.timeout || 30000
        const startTime = Date.now()
        let capturedError: any = null

        const removeListeners = [
          ctx.on('opencode/error', (sid, err) => {
            if (sid === opencodeSession.id) capturedError = err
          }),
          ctx.on('opencode/activity', (sid) => {
            if (sid === opencodeSession.id) {
              ctx.logger.info(`Session ${sid} activity detected`)
            }
          }),
          ctx.on('opencode/status', (sid, status) => {
            if (sid === opencodeSession.id) {
              ctx.logger.info(`Session ${sid} status: ${status}`)
            }
          })
        ]

        try {
          while (true) {
            if (capturedError) break

            const sessionState = activeSessions.get(sessionKey)
            if (!sessionState) {
              // Session removed means task completed
              break
            }

            const lastActivity = sessionState.lastActivity || startTime
            if (Date.now() - lastActivity > timeout) {
              ctx.logger.warn(`[${opencodeSession.id}] 响应生成超时 (无活动 ${timeout}ms)`)
              await session.send('⚠️ 响应生成超时')
              break
            }

            await new Promise(resolve => setTimeout(resolve, 100))
          }

          const { data: messages } = await c.session.messages({
            path: { id: opencodeSession.id }
          })

          let responseParts: any[] = []

          if (targetMsgId) {
            const found = messages.find((m: any) => m.info.id === targetMsgId)
            if (found) {
              responseParts = found.parts || []
            } else {
              responseParts = messages[messages.length - 1]?.parts || []
            }
          } else {
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

          await session.send(formattedResponse)

        } finally {
          removeListeners.forEach(off => off())
        }

      } catch (error) {
        const errorMsg = (error as Error).message || String(error)
        ctx.logger.error('OpenCode 错误:', errorMsg)

        // Cleanup on error
        const sessionKey = `${session.platform}-${session.userId}`
        const state = activeSessions.get(sessionKey)
        if (state && state.opencodeMessageId) {
          messageIdToSessionKey.delete(state.opencodeMessageId)
        }
        activeSessions.delete(sessionKey)

        await session.send(`❌ OpenCode 错误: ${errorMsg}`)
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

        for (const [key, value] of Array.from(sessionCache.entries())) {
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

  ctx.command('oc.agents', {
    authority: config.authority || 1,
  })
    .action(async () => {
      try {
        const c = await ensureClient()
        const { data: agents } = await c.app.agents()

        if (!agents || agents.length === 0) {
          return '暂无可用 agents'
        }

        const list = agents.map(a =>
          `🤖 ${a.name || a.id || '未命名'}${a.description ? `\n   ${a.description}` : ''}`
        ).join('\n\n')

        return `📋 可用 Agents:\n\n${list}`

      } catch (error) {
        ctx.logger.error('获取 agents 列表失败:', error)
        return '❌ 获取 agents 列表失败'
      }
    })

  ctx.command('oc.session.messages [page:number]', {
    authority: config.authority || 1,
  })
    .action(async ({ session }, page) => {
      try {
        const c = await ensureClient()
        const sessionId = getSessionId(session, config.defaultSession)

        const { data: messages } = await c.session.messages({
          path: { id: sessionId }
        })

        // Filter only user messages
        const userMessages = messages.filter((m: any) => m.info?.role === 'user')

        if (userMessages.length === 0) {
          return '暂无用户消息'
        }

        // Pagination setup
        const pageSize = 5
        const totalPages = Math.ceil(userMessages.length / pageSize)
        const currentPage = page || 1

        if (currentPage < 1 || currentPage > totalPages) {
          return `❌ 页码超出范围 (1-${totalPages})`
        }

        // Get messages for current page (newest first)
        const startIndex = (currentPage - 1) * pageSize
        const endIndex = startIndex + pageSize
        const pageMessages = userMessages.slice(startIndex, endIndex).reverse()

        // Format messages
        const formatted = pageMessages.map((m: any, idx: number) => {
          const textParts = m.parts?.filter((p: any) => p.type === 'text').map((p: any) => p.text).join('\n')
          const preview = textParts || '[无文本]'
          return `${startIndex + idx + 1}. ${preview.substring(0, 100)}${preview.length > 100 ? '...' : ''}`
        }).join('\n')

        return `📜 消息历史 (第 ${currentPage}/${totalPages} 页):\n\n${formatted}\n\n💡 使用 "oc.messages ${currentPage + 1}" 查看下一页`
      } catch (error) {
        ctx.logger.error('获取消息历史失败:', error)
        return '❌ 获取消息历史失败'
      }
    })

  clientPromise.then(() => {
    setupEventStream(client, ctx, config)
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

async function setupEventStream(client: any, ctx: Context, config: Config) {
  let isDisposed = false
  const dispose = ctx.on('dispose', () => {
    isDisposed = true
  })

  try {
    const events = await client.event.subscribe()

    for await (const event of events.stream) {
      if (isDisposed) break

      // ctx.logger.info('OpenCode 事件:', event.type, JSON.stringify(event.properties))

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
          ctx.logger.info(`会话更新: ${event.properties.info?.id || 'unknown'} event.properties: ${JSON.stringify(event.properties)}`)
          break
        case 'message.part.updated':
          await handlePartUpdated(ctx, event, config.showReasoning ?? true)
          break
        case 'message.updated':
          await handleMessageUpdated(ctx, event)
          break
        case 'session.status':
          await handleSessionStatus(ctx, event)
          break
        case 'session.error':
          await handleSessionError(ctx, event)
          break
        case 'session.diff':
          // Diff events are verbose, keep in debug
          const diffSessionId = event.properties.sessionID || event.properties.info?.id
          ctx.logger.info(`Session diff for: ${diffSessionId || 'unknown'}`)
          break
        case 'session.idle':
          ctx.logger.info(`Session idle event`)
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

async function handlePartUpdated(ctx: Context, event: any, showReasoning: boolean) {
  const part = event.properties.part

  if (!part) {
    ctx.logger.info(`Skipping part update - no part data in event: ${event.type}`)
    return
  }

  // Try to find session key via multiple methods
  // 1. Check for session ID in properties (some events have it)
  // 2. Check for message ID in path (standard resource path) and lookup in map
  if (part?.type !== 'text' && part?.type !== 'reasoning') {
    ctx.logger.info(`Event properties: ${JSON.stringify(event.properties)}`)
  }

  let sessionId = event.properties.sessionID || event.properties.info?.session_id || event.properties.info?.sessionId || part?.sessionID
  let messageId = event.path?.id || event.path?.messageId || part?.messageID

  let sessionKey: string | undefined
  let sessionState: SessionState | undefined

  // Method 1: Lookup by Session ID
  if (sessionId) {
    for (const [key, state] of Array.from(activeSessions.entries())) {
      if (state.sessionId === sessionId) {
        sessionKey = key
        sessionState = state
        break
      }
    }
  }

  // Method 2: Lookup by Message ID
  if (!sessionState && messageId) {
    sessionKey = messageIdToSessionKey.get(messageId)
    if (sessionKey) {
      sessionState = activeSessions.get(sessionKey)
    }
  }

  if (!sessionState) {
    // Log debug info to help diagnose if still failing
    ctx.logger.info(`No active session found for part update. IDs found: Session=${sessionId}, Message=${messageId}. Event keys: [${Object.keys(event).join(', ')}]`)
    return
  }

  // Handle message buffering
  if (messageId) {
    if (!sessionState.partialMessages) {
      sessionState.partialMessages = new Map()
    }

    let current = sessionState.partialMessages.get(messageId) || {}
    let shouldSend = false
    let finalContent = ''

    if (part.type === 'text') {
      current.text = part.text
      sessionState.partialMessages.set(messageId, current)
    } else if (part.type === 'reasoning') {
      current.reasoning = part.text
      sessionState.partialMessages.set(messageId, current)
    } else if (part.type === 'step-finish') {
      // Step finished, prepare to send
      shouldSend = true

      const parts: string[] = []
      if (showReasoning && current.reasoning) {
        parts.push(`🤔 思考: ${current.reasoning}`)
      }

      finalContent = parts.join('\n\n')

      // Clear buffer for this message after sending?
      // Or maybe keep it if we expect more updates? 
      // Usually step-finish means this unit of work is done.
      sessionState.partialMessages.delete(messageId)
    } else if (part.type === 'tool') {
      // Handle tool state tracking to avoid spam
      const callId = part.callID || 'unknown'
      const status = part.state?.status || 'unknown'

      if (!sessionState.toolStates) {
        sessionState.toolStates = new Map()
      }

      const lastStatus = sessionState.toolStates.get(callId)
      if (lastStatus !== status) {
        sessionState.toolStates.set(callId, status)

        const toolMsg = formatPart(part, showReasoning)
        if (toolMsg) {
          shouldSend = true
          finalContent = toolMsg
        }
      }
    } else {
      // For other types (tool_use, etc.), maybe just send immediately or ignore?
      // Based on user request, we focus on text/step-finish flow.
      // If it's a standalone event we might want to let it pass or buffer it too.
      // For now, let's strictly follow the "buffer text, send on step-finish" logic for text/reasoning.

      // If it is NOT text/reasoning, we might want to check if it needs handling.
      // formatPart handles tool_use, etc. 
      // If those don't emit 'step-finish', we might never send them if we only wait for step-finish.
      // BUT, usually tool use comes with step-start/finish too?

      // Let's use the standard formatPart for non-text/reasoning immediate updates if necessary,
      // OR assume everything is wrapped in steps.

      // Safe bet: if it's not text/reasoning/step-finish, send it immediately (legacy behavior)
      // UNLESS it interacts with the buffer.

      const legacyFormatted = formatPart(part, showReasoning)
      if (legacyFormatted) {
        // Check if we should send this immediately
        if (part.type !== 'text' && part.type !== 'reasoning' && part.type !== 'step-finish') {
          // Send immediately
          shouldSend = true
          finalContent = legacyFormatted
        }
      }
    }

    if (shouldSend && finalContent) {
      const bot = ctx.bots.find(b => b.platform === sessionState?.platform && b.selfId === sessionState?.selfId)
      if (bot) {
        bot.sendMessage(sessionState!.channelId, finalContent, sessionState!.guildId)
      } else {
        ctx.logger.warn(`Bot not found for session ${sessionKey}`)
      }
    }
  } else {
    // Fallback for events without messageId (unlikely for parts?)
    // Just send properly formatted part
    const formattedMessage = formatPart(part, showReasoning)
    if (formattedMessage) {
      const bot = ctx.bots.find(b => b.platform === sessionState?.platform && b.selfId === sessionState?.selfId)
      if (bot) {
        bot.sendMessage(sessionState!.channelId, formattedMessage, sessionState!.guildId)
      }
    }
  }

  // Update last activity
  sessionState.lastActivity = Date.now()
  activeSessions.set(sessionKey!, sessionState)
}


async function handleSessionStatus(ctx: Context, event: any) {
  const status = event.properties.status?.type || 'unknown'
  const sessionId = event.properties.sessionID || event.properties.info?.id

  let sessionKey: string | undefined
  let sessionState: SessionState | undefined

  for (const [key, state] of Array.from(activeSessions.entries())) {
    if (state.sessionId === sessionId) {
      sessionKey = key
      sessionState = state
      break
    }
  }

  if (!sessionState) {
    ctx.logger.warn(`No active session found for status update: ${sessionId} event.properties: ${JSON.stringify(event.properties)}`)
    return
  }

  ctx.logger.info(`Session ${sessionId} ${status} now`)

  if (status === 'idle') {
    if (sessionState.opencodeMessageId) {
      messageIdToSessionKey.delete(sessionState.opencodeMessageId)
    }
    activeSessions.delete(sessionKey)
    ctx.logger.info(`Session ${sessionId} idle and removed from active tracking`)
  } else {
    ctx.logger.info(`Session ${sessionId} status: ${status} (not removing from tracking)`)
  }
}

async function handleMessageUpdated(ctx: Context, event: any) {
  ctx.logger.info(`Message updated: ${event.properties.info?.id}`)
}

async function handleSessionError(ctx: Context, event: any) {
  const sessionId = event.properties.sessionID || event.properties.info?.id

  let sessionKey: string | undefined
  let sessionState: SessionState | undefined

  for (const [key, state] of Array.from(activeSessions.entries())) {
    if (state.sessionId === sessionId) {
      sessionKey = key
      sessionState = state
      break
    }
  }

  if (!sessionState) {
    ctx.logger.warn(`No active session found for error: ${sessionKey}`)
    return
  }

  const errData = event.properties.error
  const errMessage = errData?.message || event.properties.error?.message || JSON.stringify(event.properties.error)

  const bot = ctx.bots.find(b => b.platform === sessionState?.platform && b.selfId === sessionState?.selfId)
  if (bot) {
    bot.sendMessage(sessionState!.channelId, `❌ 会话错误: ${errMessage}`, sessionState!.guildId)
  }

  if (sessionState.opencodeMessageId) {
    messageIdToSessionKey.delete(sessionState.opencodeMessageId)
  }
  activeSessions.delete(sessionKey)
  ctx.logger.error(`Session ${sessionId} error: ${errMessage} - removing from active tracking`)
}
