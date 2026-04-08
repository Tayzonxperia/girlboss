// noinspection JSIgnoredPromiseFromCall,JSCheckFunctionSignatures

import mongoose from 'mongoose'
import { parse as parseJsonc } from 'jsonc-parser'
import fs from 'fs'
import crypto from 'crypto'
/** @typedef {import('./botconfig.types.js').BotConfig} BotConfig */

/** @type {Partial<BotConfig>} */
let config
try {
    config = /** @type {Partial<BotConfig>} */ (parseJsonc(fs.readFileSync('config.jsonc', 'utf8')))
} catch (error) {
    config = {}
}
const mongoosefcon = config.mongoosecon
const prefix = config.prefix
config = undefined

let redis = null
// noinspection JSUnusedGlobalSymbols
function bootstrapredis(client) {
    redis = client
}

let _sendmessage = null
let _phonenumber = null

// noinspection JSUnusedGlobalSymbols
function bootstrapsendmessage(fn, phonenumber) {
    _sendmessage = fn
    _phonenumber = phonenumber
}

const pendingcallbacks = new Map()

function pathallowed(path, requiredlevel, accesslist) {
    for (const entry of accesslist) {
        const base = entry.path
        const level = entry.level || 'r'
        if (path === base || path.startsWith(base + '.')) {
            if (requiredlevel === 'r') return true
            if (requiredlevel === 'rw' && level === 'rw') return true
        }
    }
    return false
}

function deepget(obj, path) {
    return path.split('.').reduce((cur, k) => (cur != null ? cur[k] : undefined), obj)
}

function deepset(obj, path, value) {
    const keys = path.split('.')
    let cur = obj
    for (let i = 0; i < keys.length - 1; i++) {
        if (cur[keys[i]] == null || typeof cur[keys[i]] !== 'object') {
            cur[keys[i]] = {}
        }
        cur = cur[keys[i]]
    }
    cur[keys[keys.length - 1]] = value
}

function makescopeduser(userdoc, accesslist) {
    const propssnap = JSON.parse(JSON.stringify(userdoc.protectedprops || {}))
    return {
        get(path) {
            if (!pathallowed(path, 'r', accesslist)) {
                throw new Error(`PROTECTED_ACCESS_DENIED: read not granted for path "${path}"`)
            }
            return deepget(propssnap, path)
        },
        set(path, value) {
            if (!pathallowed(path, 'rw', accesslist)) {
                throw new Error(`PROTECTED_ACCESS_DENIED: write not granted for path "${path}"`)
            }
            deepset(propssnap, path, value)
        },
        async save() {
            userdoc.protectedprops = propssnap
            userdoc.markModified('protectedprops')
            await redis.set(`auth-challenge-ok:${userdoc.userid}`, '1', 'EX', 30)
            await userdoc.save()
        },
        get userid() {
            return userdoc.userid
        },
    }
}

function exportmodels(mongoosecon = mongoosefcon) {
    if (mongoose.connection.readyState === 0) {
        mongoose.connect(mongoosecon).catch((err) => {
            console.error('[mongodb] Failed to connect while exporting models:', err?.message || err)
        })
    }
    if (mongoose.models.User) delete mongoose.models.User
    if (mongoose.models.Game) delete mongoose.models.Game
    if (mongoose.models.Poll) delete mongoose.models.Poll
    if (mongoose.models.FeatureReq) delete mongoose.models.FeatureReq
    if (mongoose.models.Webhook) delete mongoose.models.Webhook
    if (mongoose.models.State) delete mongoose.models.State
    if (mongoose.models.SSOProvider) delete mongoose.models.SSOProvider

    const userSchema = new mongoose.Schema({
        userid: String,
        username: String,
        accesslevel: Number,
        properties: Object,
        protectedprops: {
            type: Object,
            default: {},
        },
    })

    userSchema.pre('save', async function (next) {
        if (!this.isModified('protectedprops')) return next()
        if (!redis) return next(new Error('PROTECTED_WRITE_DENIED: redis not initialised'))
        const okKey = `auth-challenge-ok:${this.userid}`
        const ok = await redis.get(okKey)
        if (!ok) {
            return next(new Error('PROTECTED_WRITE_DENIED: no valid auth session found for this user.'))
        }
        await redis.del(okKey)
        return next()
    })

    const gameSchema = new mongoose.Schema({
        hostid: String,
        players: [Object],
        status: String,
        properties: Object,
    })
    const pollSchema = new mongoose.Schema({
        pollid: String,
        question: String,
        options: [String],
        votes: [Number],
        voters: [String],
    })
    const featurereqSchema = new mongoose.Schema({
        reqid: String,
        userid: String,
        feature: String,
    })
    const webhookSchema = new mongoose.Schema({
        _id: String,
        userid: String,
    })
    const stateSchema = new mongoose.Schema({
        _id: String,
        enabled: Boolean,
        updatedat: Number,
    })
    const ssoproviderSchema = new mongoose.Schema({
        _id: String,
        name: String,
        owner: String,
        key: String,
    })

    userSchema.index({ userid: 1 }, { unique: true })
    gameSchema.index({ gameid: 1 }, { unique: true })
    gameSchema.index({ players: 1 })
    pollSchema.index({ pollid: 1 }, { unique: true })
    featurereqSchema.index({ reqid: 1 }, { unique: true })
    webhookSchema.index({ userid: 1 }, { unique: true })
    ssoproviderSchema.index({ key: 1 }, { unique: true })

    mongoose.model('User', userSchema).createIndexes()
    mongoose.model('Game', gameSchema).createIndexes()
    mongoose.model('Poll', pollSchema).createIndexes()
    mongoose.model('FeatureReq', featurereqSchema).createIndexes()
    mongoose.model('Webhook', webhookSchema).createIndexes()
    mongoose.model('State', stateSchema).createIndexes()
    mongoose.model('SSOProvider', ssoproviderSchema).createIndexes()

    return mongoose
}

function formatreqmessage(token, meta, prefix) {
    const accesslines = meta.access
        .map((e) => `  - ${e.path} (${e.level === 'rw' ? 'read + write' : 'read only'})`)
        .join('\n')
    const sourceline = meta.source
        ? `Requested by: ${meta.source.module} module, command: ${prefix}${meta.source.command}${meta.source.args ? ' ' + meta.source.args : ''}`
        : 'Requested by: unknown'
    return `A command has requested access to your protected properties.\nToken: ${token}\n\n${sourceline}\nReason: ${meta.reason}\n\nAccess requested:\n${accesslines}\n\nThis request expires in 10 minutes.\nRun "${prefix}lockbox approve ${token}" to allow or "${prefix}lockbox deny ${token}" to reject.`
}

// noinspection JSUnusedGlobalSymbols
async function requestprotedit(userid, { reason, access, source, ongranted, onfail }) {
    if (!redis) throw new Error('redis not initialised')
    if (!reason || !access || !Array.isArray(access) || access.length === 0) {
        throw new Error('requestprotedit: reason and access array are required')
    }
    if (typeof ongranted !== 'function') {
        throw new Error('requestprotedit: ongranted callback is required')
    }

    const token = crypto.randomBytes(4).toString('hex').toUpperCase()
    const ttl = 10 * 60 // 10 minutes

    const meta = { userid, reason, access, source: source || null }
    await redis.set(`auth-req:${token}`, JSON.stringify(meta), 'EX', ttl)

    pendingcallbacks.set(token, { ongranted, onfail })

    if (_sendmessage && _phonenumber) {
        try {
            await _sendmessage(formatreqmessage(token, meta, prefix), userid, _phonenumber)
        } catch (e) {
            console.error('requestprotedit: failed to DM user:', e)
        }
    }

    if (typeof onfail === 'function') {
        setTimeout(async () => {
            const still = await redis.get(`auth-req:${token}`)
            if (still) {
                await redis.del(`auth-req:${token}`)
                pendingcallbacks.delete(token)
                try {
                    onfail('timeout')
                } catch (e) {
                    console.error('onfail(timeout) error:', e)
                }
            }
        }, ttl * 1000)
    }

    return token
}

// noinspection JSUnusedGlobalSymbols
async function approveprotedit(token, userdoc) {
    const raw = await redis.get(`auth-req:${token}`)
    if (!raw) return { ok: false, reason: 'expired or invalid token' }

    const meta = JSON.parse(raw)
    if (meta.userid !== userdoc.userid) return { ok: false, reason: 'token does not belong to you' }

    const cbs = pendingcallbacks.get(token)
    if (!cbs) return { ok: false, reason: 'callback expired (bot may have restarted)' }

    await redis.del(`auth-req:${token}`)
    pendingcallbacks.delete(token)

    const scopeduser = makescopeduser(userdoc, meta.access)
    try {
        await cbs.ongranted(scopeduser)
    } catch (e) {
        console.error('ongranted error:', e)
    }
    return { ok: true }
}

// noinspection JSUnusedGlobalSymbols
async function denyprotedit(token, userdoc) {
    const raw = await redis.get(`auth-req:${token}`)
    if (!raw) return { ok: false, reason: 'expired or invalid token' }

    const meta = JSON.parse(raw)
    if (meta.userid !== userdoc.userid) return { ok: false, reason: 'token does not belong to you' }

    const cbs = pendingcallbacks.get(token)

    await redis.del(`auth-req:${token}`)
    pendingcallbacks.delete(token)

    if (cbs && typeof cbs.onfail === 'function') {
        try {
            cbs.onfail('denied')
        } catch (e) {
            console.error('onfail(denied) error:', e)
        }
    }
    return { ok: true }
}

// noinspection JSUnusedGlobalSymbols
async function getprotreq(token) {
    const raw = await redis.get(`auth-req:${token}`)
    if (!raw) return null
    return JSON.parse(raw)
}

// noinspection JSUnusedGlobalSymbols
async function listprotreqs(userid) {
    const keys = await redis.keys('auth-req:*')
    const results = []
    for (const key of keys) {
        const raw = await redis.get(key)
        if (!raw) continue
        try {
            const meta = JSON.parse(raw)
            if (meta.userid === userid) {
                const token = key.slice('auth-req:'.length)
                results.push({ token, meta })
            }
        } catch (_) {}
    }
    return results
}

export {
    exportmodels,
    bootstrapredis,
    bootstrapsendmessage,
    requestprotedit,
    approveprotedit,
    denyprotedit,
    getprotreq,
    listprotreqs,
    formatreqmessage,
}
