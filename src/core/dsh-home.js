// ═══════════════════════════════════════════════════════════════
// dsh 规范 home 路径解析器（与 @deepseek-ai/dsh-home-paths 一致）
// 优先级：explicit configured > $DSH_HOME > ~/.dsh
// 作为外部插件无法直接 import @deepseek-ai/dsh-home-paths，
// 但遵循与其完全相同的解析逻辑。
// ═══════════════════════════════════════════════════════════════

const { homedir } = require('node:os')
const { join, resolve, sep } = require('node:path')

const DSH_HOME_DIR_NAME = '.dsh'
const DSH_HOME_ENV = 'DSH_HOME'

function expandHomePath(p) {
  if (p === '~') return homedir()
  if (p.startsWith('~/') || p.startsWith('~' + sep)) return join(homedir(), p.slice(2))
  return p
}

function resolveDshHome(configured, env) {
  env = env || process.env
  const fromEnv = env[DSH_HOME_ENV]
  const selected = configured
    || (fromEnv !== undefined && fromEnv.trim().length > 0
      ? fromEnv
      : join(homedir(), DSH_HOME_DIR_NAME))
  return resolve(expandHomePath(selected))
}

function dshHomePath(...segments) {
  return join(resolveDshHome(), ...segments)
}

module.exports = { dshHomePath, resolveDshHome }