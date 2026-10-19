#!/usr/bin/env node
// Pantry CLI: lets Claude Code (or you) read the kitchen and save recipes.
// No dependencies; needs Node 18+. Talks to your deployed app's /api/agent.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

const CONFIG = join(homedir(), '.config', 'pantry', 'config.json')

const HELP = `pantry: read your kitchen and save recipes

  pantry setup <app-url> <key>      Save your app address and key (Settings → Claude in the app)
  pantry inventory [--location L]   What's in the kitchen (L: pantry, fridge, freezer)
  pantry list                       The shopping list
  pantry save-recipe [file.json]    Save a recipe from a JSON file or stdin:
                                      {"title", "summary", "time_minutes", "servings",
                                       "ingredients": [{"name", "amount"}], "steps": [...]}
  pantry add-to-list <item>... [--note TEXT]
                                    Add items to the shopping list

PANTRY_URL and PANTRY_KEY override the saved setup.`

function fail(message) {
  process.stderr.write(`${message}\n`)
  process.exit(1)
}

function config() {
  let saved = {}
  if (existsSync(CONFIG)) saved = JSON.parse(readFileSync(CONFIG, 'utf8'))
  const url = process.env.PANTRY_URL ?? saved.url
  const key = process.env.PANTRY_KEY ?? saved.key
  if (!url || !key) fail('Not set up yet. Run: pantry setup <app-url> <key>')
  return { url: url.replace(/\/+$/, ''), key }
}

function flag(args, name) {
  const i = args.indexOf(name)
  if (i === -1) return undefined
  const value = args[i + 1]
  args.splice(i, 2)
  return value
}

async function readStdin() {
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

async function call(body) {
  const { url, key } = config()
  let res
  try {
    res = await fetch(`${url}/api/agent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
    })
  } catch {
    fail(`Couldn't reach ${url}. Check the address and your connection.`)
  }
  const text = await res.text()
  if (!res.ok) fail(text.trim())
  process.stdout.write(text)
}

const [command, ...args] = process.argv.slice(2)

switch (command) {
  case 'setup': {
    const [url, key] = args
    if (!url || !key) fail('Usage: pantry setup <app-url> <key>')
    mkdirSync(dirname(CONFIG), { recursive: true })
    writeFileSync(CONFIG, JSON.stringify({ url, key }, null, 2), { mode: 0o600 })
    process.stdout.write(`Saved to ${CONFIG}\n`)
    await call({ command: 'check' })
    break
  }
  case 'inventory':
    await call({ command: 'inventory', location: flag(args, '--location') })
    break
  case 'list':
    await call({ command: 'list' })
    break
  case 'save-recipe': {
    const raw = args[0] && args[0] !== '-' ? readFileSync(args[0], 'utf8') : await readStdin()
    let recipe
    try {
      recipe = JSON.parse(raw)
    } catch {
      fail('That recipe isn’t valid JSON.')
    }
    await call({ command: 'save-recipe', recipe })
    break
  }
  case 'add-to-list': {
    const note = flag(args, '--note')
    if (!args.length) fail('Usage: pantry add-to-list <item>... [--note TEXT]')
    await call({ command: 'add-to-list', items: args.map((name) => ({ name, note })) })
    break
  }
  case undefined:
  case 'help':
  case '--help':
  case '-h':
    process.stdout.write(`${HELP}\n`)
    break
  default:
    fail(`Unknown command "${command}".\n\n${HELP}`)
}
