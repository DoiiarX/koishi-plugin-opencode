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
  enableStreaming?: boolean
  streamMode?: 'auto' | 'native' | 'segment'
  streamInterval?: number
  showToolMessages?: boolean
  showProcessingMessage?: boolean
  directory?: string
}



export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    baseUrl: Schema.string().default('http://localhost:4096').description('OpenCode Server 地址'),
    defaultSession: Schema.string().description('默认会话 ID'),
    model: Schema.string().description('覆盖默认模型 (格式: provider/model)'),
    timeout: Schema.number().default(30000).description('生成超时时间 (毫秒)'),
    showReasoning: Schema.boolean().description('是否显示 agent 的推理过程').default(true),
    showToolMessages: Schema.boolean().description('是否显示工具调用消息').default(true),
    enableStreaming: Schema.boolean().description('是否开启流式输出').default(true),
    streamMode: Schema.union(['auto', 'native', 'segment']).description('流式输出模式 (auto: 自动检测, native: 编辑消息, segment: 分段发送)').default('auto'),
    streamInterval: Schema.number().description('流式更新间隔 (毫秒)').default(500),
    showProcessingMessage: Schema.boolean().description('是否显示 "正在处理" 提示消息').default(true),
    directory: Schema.string().description('默认工作区目录 (可选)'),
  }).description('OpenCode 连接配置'),
  Schema.object({
    authority: Schema.number().default(1).description('使用命令所需权限等级'),
  }).description('权限配置'),
])

const sessionCache = new Map<string, string>()

// Simple string hash for directory fingerprinting
function simpleHash(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36)
}

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

  // Streaming state
  lastStreamTime?: number
  lastStreamMessageId?: string // For native mode
  streamBufferSentIndex?: number // For segment mode: how many chars have been sent
  streamMode?: 'native' | 'segment' | 'auto' // Resolved mode for this session

  // Role tracking
  messageRoles?: Map<string, string> // messageId -> role

  // Deduplication tracking
  sentFinalMessages: Set<string> // messageId for step-finish
  sentToolCalls: Set<string> // part.id or callID:status

  // Lifecycle
  status?: string // 'idle', 'busy', 'error', etc.
  hasStreamed?: boolean // Whether we have successfully streamed/edited messages
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


  ctx.command('oc.models [keyword:text]', '列出可用模型', {
    authority: 1,
  })
    .alias('oc.m')
    .usage('列出 OpenCode 服务器支持的所有模型。可以使用关键词过滤。')
    .example('oc.models claude  列出所有包含 claude 的模型')
    .action(async (_, keyword) => {
      try {
        const opencodeClient = await ensureClient()
        const { data } = await opencodeClient.config.providers()
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

  ctx.command('oc.model.set <model:string>', '设置默认模型', {
    authority: 3,
  })
    .alias('oc.ms')
    .usage('为当前环境设置默认使用的模型。此设置会影响后续的新会话。')
    .example('oc.ms anthropic/claude-3-5-sonnet  设置为 Claude 3.5 Sonnet')
    .action(async ({ session: chatbotSession }, model) => {
      try {
        if (!model) return '❌ 请提供模型 ID (例如: anthropic/claude-3-5-sonnet)'

        // Simple validation
        if (!model.includes('/')) {
          return '❌ 模型 ID 格式应为 provider/model'
        }

        // Verify validity (optional, but good UX)
        const opencodeClient = await ensureClient()
        const { data } = await opencodeClient.config.providers()
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

  ctx.command('oc [...message]', '与 AI 对话')
    .usage('发送消息给 AI 并获取回复。支持上下文记忆和流式输出。')
    .example('oc 你好  发送"你好"')
    .example('oc 给我画一只猫  请求生成图片 (需配置 image 工具)')
    .action(async ({ session: chatbotSession }, ...messageParts) => {
      const message = messageParts.join(' ')
      if (!message.trim()) return // Ignore empty messages
      const directory = config.directory || 'default'
      const dirHash = simpleHash(directory)
      const sessionKey = `${chatbotSession.platform}-${chatbotSession.userId}-${dirHash}`

      try {
        const opencodeClient = await ensureClient()
        // const sessionId = getSessionId(chatbotSession, config.defaultSession) // No longer needed
        const opencodeSession = await getOrCreateSession(opencodeClient, chatbotSession, config)

        ctx.logger.info(`[${opencodeSession.id}] 发送消息: ${message.substring(0, 50)}...`)

        const senderName = chatbotSession.username || chatbotSession.author?.name || chatbotSession.userId
        const contextHeader = `[User: ${senderName} (ID: ${chatbotSession.userId}) | Platform: ${chatbotSession.platform}]`

        // Register or merge session state
        const existingState = activeSessions.get(sessionKey)
        const newState: SessionState = {
          ...existingState,
          sessionId: opencodeSession.id,
          platform: chatbotSession.platform,
          userId: chatbotSession.userId,
          messageId: chatbotSession.id,
          channelId: chatbotSession.channelId,
          guildId: chatbotSession.guildId,
          selfId: chatbotSession.selfId,
          lastActivity: Date.now(),
          partialMessages: existingState?.partialMessages || new Map(),
          toolStates: existingState?.toolStates || new Map(),
          sentFinalMessages: existingState?.sentFinalMessages || new Set(),
          sentToolCalls: existingState?.sentToolCalls || new Set(),
          // Don't reset hasStreamed if we are in the middle of a continuous session, 
          // but for a NEW user message, we might want to reset certain streaming markers
          streamBufferSentIndex: 0,
          lastStreamMessageId: undefined,
          hasStreamed: false
        }
        activeSessions.set(sessionKey, newState)
        ctx.logger.info(`会话状态已初始化或合并: ${sessionKey}`)

        if (config.showProcessingMessage ?? true) {
          await chatbotSession.send(`🔄 正在处理: ${message.substring(0, 30)}...`)
        }

        const systemInstructions = [
          "如果需要发送媒体文件，在回复中包含标准的 Koishi 元素标签即可自动在用户端渲染对应内容。",
          "图片: <img src='...'/>",
          "音频: <audio src='...'/>",
          "视频: <video src='...'/>",
          "通用文件: <file src='...'/>",
          "请勿对这些标签使用 Markdown 代码块包裹。如果只是发送任务，你不需要读取文件。只需要检查文件是否存在。"
        ].join('\n')

        // Inject system instructions (no reply)
        await opencodeClient.session.prompt({
          path: { id: opencodeSession.id },
          body: {
            noReply: true,
            parts: [{ type: 'text', text: systemInstructions }],
          },
        })

        // Inject user context (no reply)
        await opencodeClient.session.prompt({
          path: { id: opencodeSession.id },
          body: {
            noReply: true,
            parts: [{ type: 'text', text: contextHeader }],
          },
        })

        const result = await opencodeClient.session.prompt({
          path: { id: opencodeSession.id },
          body: {
            model: config.model ? parseModel(config.model) : undefined,
            parts: [{ type: 'text', text: message }],
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
              // Should not happen with new logic unless manually deleted
              break
            }

            // Check status from state
            if (sessionState.status === 'idle') {
              break
            }
            if (sessionState.status === 'error') {
              capturedError = true // Mark as error to skip sending
              break
            }

            const lastActivity = sessionState.lastActivity || startTime
            if (Date.now() - lastActivity > timeout) {
              ctx.logger.warn(`[${opencodeSession.id}] 响应生成超时 (无活动 ${timeout}ms)`)
              await chatbotSession.send('⚠️ 响应生成超时')
              capturedError = true // Avoid sending partial result
              break
            }

            await new Promise(resolve => setTimeout(resolve, 100))
          }

          // Final check on state
          const finalState = activeSessions.get(sessionKey)
          const hasStreamed = finalState?.hasStreamed ?? false

          if (!capturedError && !hasStreamed) {
            // Only fetch and send if we haven't streamed anything and no error occurred
            const { data: messages } = await opencodeClient.session.messages({
              path: { id: opencodeSession.id }
            })

            // ... [logic to find responseParts] ...
            let responseParts: any[] = []
            if (targetMsgId) {
              const found = messages.find((m: any) => m.info.id === targetMsgId)
              if (found) responseParts = found.parts || []
              else responseParts = messages[messages.length - 1]?.parts || []
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

            if (textParts.length === 0) {
              formattedResponse = '[无响应 - 可能是生成超时或需要更多时间]'
            }
            await chatbotSession.send(h.parse(formattedResponse))
          }

        } finally {
          removeListeners.forEach(off => off())

          // Cleanup
          const state = activeSessions.get(sessionKey)
          if (state && state.opencodeMessageId) {
            messageIdToSessionKey.delete(state.opencodeMessageId)
          }
          activeSessions.delete(sessionKey)
        }

      } catch (error) {
        const errorMsg = (error as Error).message || String(error)
        ctx.logger.error('OpenCode 错误:', errorMsg)

        // Cleanup on error
        const directory = config.directory || 'default'
        const dirHash = simpleHash(directory)
        const sessionKey = `${chatbotSession.platform}-${chatbotSession.userId}-${dirHash}`
        const state = activeSessions.get(sessionKey)
        if (state && state.opencodeMessageId) {
          messageIdToSessionKey.delete(state.opencodeMessageId)
        }
        activeSessions.delete(sessionKey)

        await chatbotSession.send(`❌ OpenCode 错误: ${errorMsg}`)
      }
    })

  ctx.command('oc.session.list', '列出活跃会话', {
    authority: 3,
  })
    .alias('oc.sl')
    .usage('显示当前 OpenCode 服务中所有的会话列表。')
    .action(async () => {
      try {
        const opencodeClient = await ensureClient()
        const { data: sessions } = await opencodeClient.session.list()

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

  ctx.command('oc.session.new', '创建新会话', {
    authority: config.authority || 1,
  })
    .alias('oc.sn')
    .usage('强制创建一个全新的会话。新会话将使用当前配置的工作区目录。')
    .example('oc.sn  创建并切换到新会话')
    .action(async ({ session: chatbotSession }) => {
      try {
        const opencodeClient = await ensureClient()
        const directory = config.directory || 'default'
        const dirHash = simpleHash(directory)
        const { data: newSession } = await opencodeClient.session.create({
          body: {
            title: `Koishi-${chatbotSession.platform}-${chatbotSession.userId}-${dirHash}-${Date.now()}`,
          },
          query: {
            directory: config.directory,
          },
        })

        const sessionKey = `${chatbotSession.platform}-${chatbotSession.userId}-${dirHash}`
        sessionCache.set(sessionKey, newSession.id)

        return `✅ 已创建会话: ${newSession.id}\n📝 标题: ${newSession.title}\n📂 目录: ${directory}`

      } catch (error) {
        ctx.logger.error('创建会话失败:', error)
        return '❌ 创建会话失败'
      }
    })

  ctx.command('oc.session.set <id:string>', '切换会话', {
    authority: 2,
  })
    .alias('oc.ss')
    .usage('切换到指定的会话 ID。')
    .example('oc.ss 1234-5678  切换到 ID 为 1234-5678 的会话')
    .action(async ({ session: chatbotSession }, id) => {
      try {
        const opencodeClient = await ensureClient()
        const { data: sessions } = await opencodeClient.session.list()
        const targetSession = sessions.find(s => s.id === id)

        if (!targetSession) {
          return `❌ 会话 ${id} 不存在`
        }

        const directory = config.directory || 'default'
        const dirHash = simpleHash(directory)
        const sessionKey = `${chatbotSession.platform}-${chatbotSession.userId}-${dirHash}`
        sessionCache.set(sessionKey, id)

        return `✅ 已切换到会话: ${id}\n📝 标题: ${targetSession.title}`

      } catch (error) {
        ctx.logger.error('切换会话失败:', error)
        return '❌ 切换会话失败'
      }
    })

  ctx.command('oc.session.info', '查看当前会话信息', {
    authority: config.authority || 1,
  })
    .alias('oc.si')
    .usage('显示当前连接的会话详情，包括 ID、标题、模型和创建时间。')
    .action(async ({ session: chatbotSession }) => {
      try {
        const opencodeClient = await ensureClient()
        // const sessionId = getSessionId(chatbotSession, config.defaultSession)
        const opencodeSession = await getOrCreateSession(opencodeClient, chatbotSession, config)

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

  ctx.command('oc.session.delete <id:string>', '删除会话', {
    authority: 4,
  })
    .alias('oc.sdel')
    .usage('删除指定的会话。此操作不可逆。')
    .example('oc.sdel 1234-5678  删除会话')
    .action(async (_, id) => {
      try {
        const opencodeClient = await ensureClient()
        await opencodeClient.session.delete({ path: { id } })

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

  ctx.command('oc.health', '检查服务健康状态', {
    authority: config.authority || 1,
  })
    .alias('oc.h')
    .usage('检查 OpenCode 服务器的连接状态和版本信息。')
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

  ctx.command('oc.agents', '列出可用 Agents', {
    authority: config.authority || 1,
  })
    .usage('列出 OpenCode 服务器上所有可用的 Agent 工具。')
    .action(async () => {
      try {
        const opencodeClient = await ensureClient()
        const { data: agents } = await opencodeClient.app.agents()

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

  ctx.command('oc.stream.status', '查看流式输出状态', {
    authority: config.authority || 1,
  })
    .usage('查看当前会话的流式输出配置和适配器支持情况。')
    .action(({ session }) => {
      const enable = config.enableStreaming ?? true
      const mode = config.streamMode ?? 'auto'
      const interval = config.streamInterval ?? 500

      let msg = `🌊 流式输出状态:\n`
      msg += `启用: ${enable ? '✅ 开启' : '❌ 关闭'}\n`
      msg += `配置模式: ${mode}\n`

      if (enable) {
        if (mode === 'auto') {
          // Check capability
          const canEdit = session.bot && typeof session.bot.editMessage === 'function'
          msg += `当前判定: ${canEdit ? '⚡ 原生流式 (Native)' : '📝 分段流式 (Segment)'}\n`
          msg += canEdit
            ? `(适配器支持 editMessage)`
            : `(适配器不支持 editMessage，自动降级)`
        } else if (mode === 'native') {
          msg += `当前策略: ⚡ 原生流式 (强制)\n`
          msg += `(注: 若平台不支持，可能会发送失败并回退)`
        } else {
          msg += `当前策略: 📝 分段流式 (强制)`
        }
        msg += `\n更新间隔: ${interval}ms`
      }

      return msg
    })

  ctx.command('oc.session.messages [page:number]', '查看历史消息', {
    authority: config.authority || 1,
  })
    .usage('分页查看当前会话的历史用户消息。')
    .example('oc.session.messages 2  查看第 2 页消息')
    .action(async ({ session: chatbotSession }, page) => {
      try {
        const opencodeClient = await ensureClient()
        const opencodeSession = await getOrCreateSession(opencodeClient, chatbotSession, config)

        const { data: messages } = await opencodeClient.session.messages({
          path: { id: opencodeSession.id }
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

// function getSessionId(session: any, defaultId?: string): string {
//   const cacheKey = `${session.platform}-${session.userId}`
//   const cached = sessionCache.get(cacheKey)

//   if (cached) return cached
//   if (defaultId) return defaultId

//   return `koishi-${session.platform}-${session.userId || 'default'}`
// }

async function getOrCreateSession(
  client: any,
  chatbotSession: any,
  config: Config,
): Promise<any> {
  const directory = config.directory || 'default'
  const dirHash = simpleHash(directory)
  const sessionKey = `${chatbotSession.platform}-${chatbotSession.userId}-${dirHash}`
  const cachedId = sessionCache.get(sessionKey)

  // 1. Try cache
  if (cachedId) {
    try {
      const { data } = await client.session.get({ path: { id: cachedId } })
      if (data && data.id) {
        return data
      }
      // If cache invalid (404), remove and continue
      sessionCache.delete(sessionKey)
    } catch {
      sessionCache.delete(sessionKey)
    }
  }

  // 2. Try to find existing session by Title keys
  const titlePrefix = `Koishi-${chatbotSession.platform}-${chatbotSession.userId}-${dirHash}`
  try {
    const { data: sessions } = await client.session.list()
    // Find all sessions with matching prefix
    if (sessions && sessions.length > 0) {
      const candidates = sessions.filter((s: any) => s.title && s.title.startsWith(titlePrefix))

      if (candidates.length > 0) {
        // Sort by timestamp in title if possible, or by createdAt descending
        candidates.sort((a: any, b: any) => {
          // Try to extract timestamp from title: Prefix-TIMESTAMP
          const timeA = parseInt(a.title.split('-').pop() || '0')
          const timeB = parseInt(b.title.split('-').pop() || '0')

          if (!isNaN(timeA) && !isNaN(timeB) && timeA > 0 && timeB > 0) {
            return timeB - timeA // Descending
          }
          // Fallback to createdAt
          if (a.createdAt && b.createdAt) {
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          }
          return 0
        })

        const best = candidates[0]
        sessionCache.set(sessionKey, best.id)
        return best
      }
    }
  } catch (error) {
    // List failed?
  }

  // 3. Create new session
  const newTitle = `${titlePrefix}-${Date.now()}`
  const result = await client.session.create({
    body: {
      title: newTitle,
    },
    query: {
      directory: config.directory,
    },
  })

  if (result.data) {
    sessionCache.set(sessionKey, result.data.id)
    return result.data
  }

  throw new Error('Failed to create session')
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
          await handlePartUpdated(ctx, event, config)
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

async function handlePartUpdated(ctx: Context, event: any, config: Config) {
  const showReasoning = config.showReasoning ?? true
  const enableStreaming = config.enableStreaming ?? true
  const streamModeConfig = config.streamMode ?? 'auto'
  const streamInterval = config.streamInterval ?? 500
  const showToolMessages = config.showToolMessages ?? true

  const part = event.properties.part

  if (!part) {
    ctx.logger.info(`Skipping part update - no part data in event: ${event.type}`)
    return
  }

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

  if (!sessionState || !sessionKey) {
    ctx.logger.info(`No active session found for part update. IDs found: Session=${sessionId}, Message=${messageId}.`)
    return
  }

  // Role Filtering: Ignore parts from 'user' messages
  if (messageId && sessionState.messageRoles) {
    const role = sessionState.messageRoles.get(messageId)
    if (role === 'user') {
      return
    }
  }

  // Handle message buffering
  let shouldSend = false
  let finalContent = ''
  let isStepFinish = false
  let current: { text?: string; reasoning?: string } = {}

  if (messageId) {
    if (!sessionState.partialMessages) {
      sessionState.partialMessages = new Map()
    }

    current = sessionState.partialMessages.get(messageId) || {}

    if (part.type === 'text') {
      current.text = part.text
      sessionState.partialMessages.set(messageId, current)
    } else if (part.type === 'reasoning') {
      current.reasoning = part.text
      sessionState.partialMessages.set(messageId, current)
    } else if (part.type === 'step-finish') {
      isStepFinish = true
      shouldSend = true

      if (sessionState.sentFinalMessages.has(messageId)) {
        shouldSend = false
        return
      }

      const parts: string[] = []
      if (showReasoning && current.reasoning) {
        parts.push(`🤔 思考: ${current.reasoning}`)
      }
      if (current.text) {
        parts.push(current.text)
      }

      finalContent = parts.join('\n\n')
    } else if (part.type === 'tool') {
      if (showToolMessages) {
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
            const toolPartId = part.id || `${callId}:${status}`
            if (sessionState.sentToolCalls.has(toolPartId)) {
              shouldSend = false
            } else {
              shouldSend = true
              finalContent = toolMsg
            }
          }
        }
      }
    } else {
      const legacyFormatted = formatPart(part, showReasoning)
      if (legacyFormatted) {
        if (part.type !== 'text' && part.type !== 'reasoning' && part.type !== 'step-finish') {
          const partId = part.id || `${messageId}:${part.type}`
          if (sessionState.sentToolCalls.has(partId)) {
            shouldSend = false
          } else {
            shouldSend = true
            finalContent = legacyFormatted
          }
        }
      }
    }

    // --- Streaming Logic ---
    if (enableStreaming && (part.type === 'text' || part.type === 'reasoning' || isStepFinish)) {
      const parts: string[] = []
      if (showReasoning && current.reasoning) {
        parts.push(`🤔 思考: ${current.reasoning}`)
      }
      if (current.text) {
        parts.push(current.text)
      }
      const fullContent = parts.join('\n\n')

      if (fullContent) {
        // Determine streaming mode if not set
        if (!sessionState.streamMode) {
          const bot = ctx.bots.find(b => b.platform === sessionState?.platform && b.selfId === sessionState?.selfId)
          if (streamModeConfig === 'native') {
            sessionState.streamMode = 'native'
          } else if (streamModeConfig === 'segment') {
            sessionState.streamMode = 'segment'
          } else {
            // Auto detection
            if (bot && typeof bot.editMessage === 'function') {
              sessionState.streamMode = 'native'
            } else {
              sessionState.streamMode = 'segment'
            }
          }
        }

        if (sessionState.streamMode === 'native') {
          const handled = await handleNativeStreaming(ctx, sessionState, fullContent, streamInterval, isStepFinish)
          if (handled) shouldSend = false
        } else if (sessionState.streamMode === 'segment') {
          const handled = await handleSegmentedStreaming(ctx, sessionState, fullContent, isStepFinish)
          if (handled) shouldSend = false
        }

        // If this is the final part of a step, ensure we mark as streamed
        // to prevent the main loop from sending a fallback message.
        if (isStepFinish && (sessionState.streamMode === 'native' || sessionState.streamMode === 'segment')) {
          sessionState.hasStreamed = true
          if (messageId) sessionState.sentFinalMessages.add(messageId)
        }
      }
    }

    if (shouldSend && finalContent) {
      if (!enableStreaming || (part.type !== 'text' && part.type !== 'reasoning' && part.type !== 'step-finish')) {
        const bot = ctx.bots.find(b => b.platform === sessionState?.platform && b.selfId === sessionState?.selfId)
        if (bot) {
          await bot.sendMessage(sessionState!.channelId, finalContent, sessionState!.guildId)
          sessionState.hasStreamed = true

          // Mark as sent
          if (part.type === 'step-finish' && messageId) {
            sessionState.sentFinalMessages.add(messageId)
          } else {
            const trackId = part.id || (part.callID ? `${part.callID}:${part.state?.status}` : `${messageId}:${part.type}`)
            sessionState.sentToolCalls.add(trackId)
          }
        } else {
          ctx.logger.warn(`Bot not found for session ${sessionKey}`)
        }
      }
    }
  } else {
    // Fallback for events without messageId
    const formattedMessage = formatPart(part, showReasoning)
    if (formattedMessage) {
      const partId = part.id || `${sessionId || 'fallback'}:${part.type}`
      if (!sessionState.sentToolCalls.has(partId)) {
        const bot = ctx.bots.find(b => b.platform === sessionState?.platform && b.selfId === sessionState?.selfId)
        if (bot) {
          await bot.sendMessage(sessionState!.channelId, formattedMessage, sessionState!.guildId)
          sessionState.sentToolCalls.add(partId)
          sessionState.hasStreamed = true
        }
      }
    }
  }

  // Update last activity
  sessionState.lastActivity = Date.now()
  activeSessions.set(sessionKey!, sessionState)
}

async function handleNativeStreaming(
  ctx: Context,
  sessionState: SessionState,
  fullContent: string,
  streamInterval: number,
  isStepFinish: boolean
): Promise<boolean> {
  const now = Date.now()
  const lastTime = sessionState.lastStreamTime || 0
  let handled = false

  if (isStepFinish || (now - lastTime > streamInterval) || !sessionState.lastStreamMessageId) {
    const bot = ctx.bots.find(b => b.platform === sessionState?.platform && b.selfId === sessionState?.selfId)
    if (bot) {
      try {
        if (sessionState.lastStreamMessageId) {
          await bot.editMessage(sessionState.channelId, sessionState.lastStreamMessageId, h.parse(fullContent))
          sessionState.lastStreamTime = now
          sessionState.hasStreamed = true
        } else {
          const sentIds = await bot.sendMessage(sessionState.channelId, h.parse(fullContent), sessionState.guildId)
          if (sentIds && sentIds.length > 0) {
            sessionState.lastStreamMessageId = sentIds[0]
            sessionState.lastStreamTime = now
            sessionState.hasStreamed = true
          }
        }
      } catch (err) {
        ctx.logger.warn(`Native streaming failed, downgrading to segment mode:`, err)
        sessionState.streamMode = 'segment'
        sessionState.streamBufferSentIndex = fullContent.length
      }
    }
  }

  if (isStepFinish) {
    sessionState.hasStreamed = true
    handled = true
  }
  return handled
}

async function handleSegmentedStreaming(
  ctx: Context,
  sessionState: SessionState,
  fullContent: string,
  isStepFinish: boolean
): Promise<boolean> {
  const sentIndex = sessionState.streamBufferSentIndex || 0
  const newContent = fullContent.substring(sentIndex)
  let handled = false

  if (newContent) {
    let toSend = ''
    let newSentIndex = sentIndex

    if (isStepFinish) {
      toSend = newContent
      newSentIndex = fullContent.length
    } else {
      // Check for sentence boundaries
      // Find safe split index
      let splitIndex = -1

      // Stricter delimiters: \n\n, 。, . (followed by space or end of string)
      const d1 = newContent.lastIndexOf('\n\n')
      const d2 = newContent.lastIndexOf('。')
      // Check for ". " (dot preceded by a letter and followed by whitespace)
      let d3 = -1
      const dotMatch = [...newContent.matchAll(/[a-zA-Z]\.[\s\n]/g)]
      if (dotMatch.length > 0) {
        // match index is for the character, dot is +1
        d3 = dotMatch[dotMatch.length - 1].index! + 1
      }

      const lastDelimiter = Math.max(d1 !== -1 ? d1 + 1 : -1, d2, d3)
      // Adjust splitIndex based on delimiter (include delimiter for 。 and . )
      if (lastDelimiter !== -1) {
        if (lastDelimiter === d1 + 1) splitIndex = d1 + 2 // After \n\n
        else splitIndex = lastDelimiter + 1
      }

      // Tag Integrity Protection
      // Check if the potential chunk (or the whole newContent if no delimiter) ends with an incomplete media tag
      const candidate = splitIndex !== -1 ? newContent.substring(0, splitIndex) : newContent

      // Regex to match incomplete tags at the end of string: <(image|audio|video|file)... without closing >
      // We look for: < followed by one of the keywords, optionally more content, but NOT followed by >
      const incompleteTagRegex = /<(?:img|audio|video|file)[^>]*$/i

      if (incompleteTagRegex.test(candidate)) {
        // Tag integrity logic...
        const match = candidate.match(/<(?:img|audio|video|file)[^>]*$/i)
        if (match) {
          const tagStart = match.index!
          if (splitIndex !== -1 && splitIndex <= tagStart) {
            // Already splitting before the tag
          } else {
            if (tagStart > 0) splitIndex = tagStart
            else splitIndex = -1
          }
        }
      }

      if (splitIndex !== -1) {
        toSend = newContent.substring(0, splitIndex)
        newSentIndex = sentIndex + toSend.length
      }
    }

    if (toSend) {
      const bot = ctx.bots.find(b => b.platform === sessionState?.platform && b.selfId === sessionState?.selfId)
      if (bot) {
        await bot.sendMessage(sessionState.channelId, h.parse(toSend), sessionState.guildId)
        sessionState.streamBufferSentIndex = newSentIndex
        sessionState.hasStreamed = true
      }
    }
  }

  if (isStepFinish) {
    sessionState.hasStreamed = true
    handled = true
  }
  return handled
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
    if (sessionState) {
      sessionState.status = 'idle'
      activeSessions.set(sessionKey, sessionState)
    }
    // Don't delete here, let the main loop handle cleanup and final reporting
    ctx.logger.info(`Session ${sessionId} idle (marked for commands to pick up)`)
  } else {
    if (sessionState) {
      sessionState.status = status
      activeSessions.set(sessionKey, sessionState)
    }
    ctx.logger.info(`Session ${sessionId} status: ${status}`)
  }
}

async function handleMessageUpdated(ctx: Context, event: any) {
  const msgId = event.properties.info?.id
  const role = event.properties.info?.role

  ctx.logger.info(`Message updated: ${msgId} (Role: ${role})`)

  if (msgId && role) {
    // Find session and update role map
    const sessionId = event.properties.sessionID || event.properties.info?.sessionID
    if (sessionId) {
      for (const state of Array.from(activeSessions.values())) {
        if (state.sessionId === sessionId) {
          if (!state.messageRoles) {
            state.messageRoles = new Map()
          }
          state.messageRoles.set(msgId, role)
          break
        }
      }
    }
  }
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
    ctx.logger.warn(`No active session found for error: ${sessionId}`)
    return
  }

  const errData = event.properties.error
  const errMessage = errData?.message || event.properties.error?.message || JSON.stringify(event.properties.error)

  // Mark session as error for main loop
  if (sessionState) {
    sessionState.status = 'error'
    activeSessions.set(sessionKey, sessionState)
  }

  const bot = ctx.bots.find(b => b.platform === sessionState?.platform && b.selfId === sessionState?.selfId)
  if (bot) {
    await bot.sendMessage(sessionState!.channelId, `❌ 会话错误: ${errMessage}`, sessionState!.guildId)
  }

  // Don't delete immediately, let loop handle it
  ctx.logger.error(`Session ${sessionId} error: ${errMessage}`)
}
