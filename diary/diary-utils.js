import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

const localDataKey = 'haezzi-widget'
const localConfigKey = 'haezzi-widget-config'
const localResolvedKey = 'haezzi-widget-resolved' // ✅ 자동으로 찾은 테이블명 저장

const defaultSupabaseConfig = {
  url: 'https://rpbkrbqbvcamhuhzupdw.supabase.co',
  key: 'sb_publishable_pm_hrlt-nEuzhXwPAgmrUA_7rXPfPTl'
}

const demoDiaries = [
  { id: 'demo-diary-1', entry_date: formatDate(new Date()), title: '데모 일기', content: '오늘의 느낌을 적어보세요.' },
  { id: 'demo-diary-2', entry_date: shiftDay(new Date(), -1), title: '어제의 기록', content: '어제 기억나는 한 가지를 적어보세요.' },
  { id: 'demo-diary-3', entry_date: shiftDay(new Date(), -7), title: '일주일 전', content: '일주일 전에 무슨 일이 있었나요?' },
  { id: 'demo-diary-4', entry_date: shiftDay(new Date(), -30), title: '한 달 전', content: '한 달 전의 자신에게 메모를 남겨보세요.' },
  { id: 'demo-diary-5', entry_date: shiftDay(new Date(), -17), title: '랜덤 하루', content: '날짜와 상관없이 자유롭게 적어보는 샘플입니다.' }
]

const demoEvents = [
  {
    id: 'demo-event-1',
    event_date: formatDate(new Date()),
    title: '샘플 일정',
    notes: 'Supabase 연결 후 삭제하거나 교체해보세요.'
  },
  {
    id: 'demo-event-2',
    event_date: shiftDay(new Date(), 2),
    title: '미래 일정',
    notes: '노션 위젯에서 미리보기용.'
  }
]

let supabase = null

// ===== 유틸 =====
export function formatDate(date) {
  if (typeof date === 'string') return date
  return date.toISOString().split('T')[0]
}

export function shiftDay(base, days) {
  const copy = new Date(base)
  copy.setDate(copy.getDate() + days)
  return formatDate(copy)
}

export function setStatus(statusEl, text, variant = 'offline') {
  if (!statusEl) return
  statusEl.textContent = text
  statusEl.className = `status ${variant}`
}

function safeGetItem(key) {
  try { return localStorage.getItem(key) } catch { return null }
}
function safeSetItem(key, value) {
  try { localStorage.setItem(key, value); return true } catch { return false }
}
function safeRemoveItem(key) {
  try { localStorage.removeItem(key) } catch {}
}

function normalizeSupabaseUrl(url) {
  if (!url) return ''
  return String(url).trim().replace(/\/+$/, '')
}
function normalizeKey(key) {
  return String(key || '').trim()
}
function isLikelySupabaseUrl(url) {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && /supabase\.co$/i.test(u.hostname)
  } catch {
    return false
  }
}
function isLikelyPublicKey(key) {
  if (!key) return false
  return key.startsWith('sb_publishable_') || key.startsWith('eyJ')
}

function isMissingTableError(error) {
  // PostgREST table not found
  return error?.code === 'PGRST205'
}

function sortByDateDesc(list, dateKey) {
  return [...list].sort((a, b) => (a[dateKey] > b[dateKey] ? -1 : 1))
}
function sortByDateAsc(list, dateKey) {
  return [...list].sort((a, b) => (a[dateKey] > b[dateKey] ? 1 : -1))
}

// ===== 테이블명/컬럼명 자동 탐색 후보 =====
const diaryTableCandidates = [
  { table: 'diary_entries', dateKey: 'entry_date' }, // 현재 코드 기준
  { table: 'diaries', dateKey: 'entry_date' },
  { table: 'diaries', dateKey: 'date' },
  { table: 'diary', dateKey: 'entry_date' },
  { table: 'diary', dateKey: 'date' },
  { table: 'entries', dateKey: 'entry_date' },
  { table: 'entries', dateKey: 'date' }
]

const calendarTableCandidates = [
  { table: 'calendar_events', dateKey: 'event_date' }, // 현재 코드 기준
  { table: 'calendar', dateKey: 'event_date' },
  { table: 'calendar', dateKey: 'date' },
  { table: 'events', dateKey: 'event_date' },
  { table: 'events', dateKey: 'date' }
]

function loadResolved() {
  const stored = safeGetItem(localResolvedKey)
  if (!stored) return { diary: null, calendar: null }
  try {
    return JSON.parse(stored)
  } catch {
    return { diary: null, calendar: null }
  }
}
function saveResolved(resolved) {
  safeSetItem(localResolvedKey, JSON.stringify(resolved))
}

async function findWorkingTable(client, candidates, { testWhere, testOrderAsc = false, testLimit = 1 } = {}) {
  for (const c of candidates) {
    let q = client.from(c.table).select('*')

    if (testWhere) q = testWhere(q, c)
    if (c.dateKey) q = q.order(c.dateKey, { ascending: testOrderAsc })
    q = q.limit(testLimit)

    const { error } = await q
    if (!error) return c

    if (isMissingTableError(error)) {
      // 다음 후보로 진행
      continue
    }
    // 테이블은 있는데 dateKey가 틀리거나 권한/RLS 문제일 수도 있음
    // 이 경우 "테이블 자체는 있음" 가능성이 높으니, dateKey 없이 재시도
    const { error: error2 } = await client.from(c.table).select('*').limit(1)
    if (!error2) return { table: c.table, dateKey: null }

    // 그래도 실패면 다음 후보
  }
  return null
}

// ===== Config =====
export function loadConfig() {
  const stored = safeGetItem(localConfigKey)
  if (!stored) return null
  try {
    const parsed = JSON.parse(stored)
    const url = normalizeSupabaseUrl(parsed?.url)
    const key = normalizeKey(parsed?.key)
    if (!url || !key) return null
    return { url, key }
  } catch (error) {
    console.error('Invalid config', error)
    return null
  }
}

export function saveConfig(config) {
  const url = normalizeSupabaseUrl(config?.url)
  const key = normalizeKey(config?.key)
  safeSetItem(localConfigKey, JSON.stringify({ url, key }))
}

export function clearConfig({ statusEl, urlInput, keyInput } = {}) {
  safeRemoveItem(localConfigKey)
  safeRemoveItem(localResolvedKey)
  supabase = null
  if (urlInput) urlInput.value = ''
  if (keyInput) keyInput.value = ''
  setStatus(statusEl, '로컬 데모 모드', 'offline')
}

export function connectSupabase(config, statusEl) {
  const url = normalizeSupabaseUrl(config?.url)
  const key = normalizeKey(config?.key)

  if (!url || !key) {
    setStatus(statusEl, '설정 없음 - 로컬 데모 모드', 'offline')
    supabase = null
    return null
  }
  if (!isLikelySupabaseUrl(url) || !isLikelyPublicKey(key)) {
    setStatus(statusEl, 'URL/KEY 형식이 이상함 - 로컬 데모 모드', 'offline')
    supabase = null
    return null
  }

  supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  })

  setStatus(statusEl, 'Supabase 연결됨(테이블 확인 중)', 'loading')
  return supabase
}

export async function bootstrapConfig({ statusEl, urlInput, keyInput }) {
  const config = loadConfig()
  const useConfig = config || defaultSupabaseConfig

  if (urlInput) urlInput.value = useConfig.url
  if (keyInput) keyInput.value = useConfig.key

  connectSupabase(useConfig, statusEl)

  // ✅ 연결 후 테이블 자동 탐색(가능하면)
  if (supabase) {
    const resolved = loadResolved()

    if (!resolved.diary) {
      const foundDiary = await findWorkingTable(supabase, diaryTableCandidates)
      if (foundDiary) resolved.diary = foundDiary
    }

    if (!resolved.calendar) {
      const foundCal = await findWorkingTable(
        supabase,
        calendarTableCandidates,
        {
          testWhere: (q, c) =>
            // 날짜 조건이 있어도 없어도 작동해야 하므로, 우선 where 없이 통과 가능한지 확인
            // (where는 실제 fetch에서 적용)
            q
        }
      )
      if (foundCal) resolved.calendar = foundCal
    }

    saveResolved(resolved)

    if (resolved.diary || resolved.calendar) {
      setStatus(statusEl, 'Supabase 연결됨', 'online')
    } else {
      // 테이블을 하나도 못 찾으면 실제론 쓸 수 없음 → 로컬로
      supabase = null
      setStatus(statusEl, '테이블을 찾지 못함 - 로컬 데모 모드', 'offline')
    }
  }

  if (!config) saveConfig(useConfig)
  return useConfig
}

// ===== Local =====
export function loadLocalData() {
  const stored = safeGetItem(localDataKey)
  if (!stored) return { events: demoEvents, diaries: demoDiaries }

  try {
    const parsed = JSON.parse(stored)
    return {
      events: Array.isArray(parsed?.events) ? parsed.events : demoEvents,
      diaries: Array.isArray(parsed?.diaries) ? parsed.diaries : demoDiaries
    }
  } catch (error) {
    console.error('Invalid local data', error)
    return { events: demoEvents, diaries: demoDiaries }
  }
}

export function saveLocalData(data) {
  safeSetItem(localDataKey, JSON.stringify(data))
}

// ===== Diaries =====
export async function fetchDiaries({ limit = 50, onError } = {}) {
  if (!supabase) {
    const local = loadLocalData()
    return sortByDateDesc(local.diaries, 'entry_date').slice(0, limit)
  }

  const resolved = loadResolved()
  const diary = resolved.diary || { table: 'diary_entries', dateKey: 'entry_date' }

  let query = supabase.from(diary.table).select('*')
  if (diary.dateKey) query = query.order(diary.dateKey, { ascending: false })
  query = query.limit(limit)

  const { data, error } = await query

  if (error) {
    console.error(error)
    // 테이블이 없으면 다시 탐색 후 재시도
    if (isMissingTableError(error)) {
      const found = await findWorkingTable(supabase, diaryTableCandidates)
      if (found) {
        resolved.diary = found
        saveResolved(resolved)
        return fetchDiaries({ limit, onError })
      }
    }
    supabase = null
    onError?.('Supabase 연결 오류 - 로컬 데이터로 전환')
    const local = loadLocalData()
    return sortByDateDesc(local.diaries, 'entry_date').slice(0, limit)
  }

  return data || []
}

export async function storeDiary(payload, { onError } = {}) {
  let result
  if (supabase) {
    const resolved = loadResolved()
    const diary = resolved.diary || { table: 'diary_entries', dateKey: 'entry_date' }

    const { data, error } = await supabase
      .from(diary.table)
      .insert([payload])
      .select()
      .single()

    if (!error) {
      result = data
      // 데이터 변경 브로드캐스트
      broadcastDataChange('diary', { action: 'create', data: result })
      return result
    }

    console.error(error)
    if (isMissingTableError(error)) {
      const found = await findWorkingTable(supabase, diaryTableCandidates)
      if (found) {
        resolved.diary = found
        saveResolved(resolved)
        return storeDiary(payload, { onError })
      }
    }

    supabase = null
    onError?.('Supabase 연결 오류 - 로컬 데이터로 전환')
  }

  const local = loadLocalData()
  const entry = { id: crypto.randomUUID?.() || String(Date.now()), ...payload }
  local.diaries.unshift(entry)
  saveLocalData(local)
  result = entry
  // 데이터 변경 브로드캐스트
  broadcastDataChange('diary', { action: 'create', data: result })
  return result
}

// ===== Calendar Events (추가로 필요하면) =====
export async function fetchCalendarEvents({ fromDate, toDate, limit = 200, onError } = {}) {
  if (!supabase) {
    const local = loadLocalData()
    // 로컬 events 구조가 없으면 빈 배열
    return sortByDateAsc(local.events || [], 'event_date').slice(0, limit)
  }

  const resolved = loadResolved()
  const cal = resolved.calendar || { table: 'calendar_events', dateKey: 'event_date' }

  let q = supabase.from(cal.table).select('*')

  // 날짜 필터는 dateKey가 있을 때만 적용 (모르면 필터 없이 반환)
  if (cal.dateKey && fromDate) q = q.gte(cal.dateKey, fromDate)
  if (cal.dateKey && toDate) q = q.lte(cal.dateKey, toDate)
  if (cal.dateKey) q = q.order(cal.dateKey, { ascending: true })
  q = q.limit(limit)

  const { data, error } = await q

  if (error) {
    console.error(error)
    if (isMissingTableError(error)) {
      const found = await findWorkingTable(supabase, calendarTableCandidates)
      if (found) {
        resolved.calendar = found
        saveResolved(resolved)
        return fetchCalendarEvents({ fromDate, toDate, limit, onError })
      }
    }
    supabase = null
    onError?.('Supabase 연결 오류 - 로컬 데이터로 전환')
    const local = loadLocalData()
    return (local.events || []).slice(0, limit)
  }

  return data || []
}

export async function storeCalendarEvent(payload, { onError } = {}) {
  let result
  if (supabase) {
    const resolved = loadResolved()
    const cal = resolved.calendar || { table: 'calendar_events', dateKey: 'event_date' }

    const { data, error } = await supabase.from(cal.table).insert([payload]).select().single()

    if (!error) {
      result = data
      // 데이터 변경 브로드캐스트
      broadcastDataChange('calendar', { action: 'create', data: result })
      return result
    }

    console.error(error)
    if (isMissingTableError(error)) {
      const found = await findWorkingTable(supabase, calendarTableCandidates)
      if (found) {
        resolved.calendar = found
        saveResolved(resolved)
        return storeCalendarEvent(payload, { onError })
      }
    }

    supabase = null
    onError?.('Supabase 연결 오류 - 로컬 데이터로 전환')
  }

  const local = loadLocalData()
  const entry = { id: crypto.randomUUID?.() || String(Date.now()), ...payload }
  local.events.push(entry)
  saveLocalData(local)
  result = entry
  // 데이터 변경 브로드캐스트
  broadcastDataChange('calendar', { action: 'create', data: result })
  return result
}

export async function updateCalendarEvent(id, payload, { onError } = {}) {
  let result
  if (supabase) {
    const resolved = loadResolved()
    const cal = resolved.calendar || { table: 'calendar_events', dateKey: 'event_date' }

    const { data, error } = await supabase
      .from(cal.table)
      .update(payload)
      .eq('id', id)
      .select()
      .single()

    if (!error) {
      result = data
      // 데이터 변경 브로드캐스트
      broadcastDataChange('calendar', { action: 'update', data: result })
      return result
    }

    console.error(error)
    if (isMissingTableError(error)) {
      const found = await findWorkingTable(supabase, calendarTableCandidates)
      if (found) {
        resolved.calendar = found
        saveResolved(resolved)
        return updateCalendarEvent(id, payload, { onError })
      }
    }

    supabase = null
    onError?.('Supabase 연결 오류 - 로컬 데이터로 전환')
  }

  const local = loadLocalData()
  const eventIndex = (local.events || []).findIndex((e) => e.id === id)
  if (eventIndex !== -1) {
    local.events[eventIndex] = { ...local.events[eventIndex], ...payload }
    saveLocalData(local)
    result = local.events[eventIndex]
    // 데이터 변경 브로드캐스트
    broadcastDataChange('calendar', { action: 'update', data: result })
  }
  return result
}

export async function deleteCalendarEvent(id, { onError } = {}) {
  if (supabase) {
    const resolved = loadResolved()
    const cal = resolved.calendar || { table: 'calendar_events', dateKey: 'event_date' }

    const { error } = await supabase.from(cal.table).delete().eq('id', id)

    if (!error) {
      // 데이터 변경 브로드캐스트
      broadcastDataChange('calendar', { action: 'delete', id: id })
      return true
    }

    console.error(error)
    if (isMissingTableError(error)) {
      const found = await findWorkingTable(supabase, calendarTableCandidates)
      if (found) {
        resolved.calendar = found
        saveResolved(resolved)
        return deleteCalendarEvent(id, { onError })
      }
    }

    supabase = null
    onError?.('Supabase 연결 오류 - 로컬 데이터로 전환')
  }

  const local = loadLocalData()
  local.events = (local.events || []).filter((event) => event.id !== id)
  saveLocalData(local)
  // 데이터 변경 브로드캐스트
  broadcastDataChange('calendar', { action: 'delete', id: id })
  return true
}

export async function fetchDiaryMarkers({ fromDate, toDate, limit = 400, onError } = {}) {
  const dateKeyFallback = 'entry_date'

  if (!supabase) {
    const local = loadLocalData()
    const dates = (local.diaries || [])
      .filter((entry) => {
        if (!fromDate && !toDate) return true
        const date = entry[dateKeyFallback]
        if (fromDate && date < fromDate) return false
        if (toDate && date > toDate) return false
        return true
      })
      .map((entry) => entry[dateKeyFallback])

    return Array.from(new Set(dates))
  }

  const resolved = loadResolved()
  const diary = resolved.diary || { table: 'diary_entries', dateKey: dateKeyFallback }
  const dateKey = diary.dateKey || dateKeyFallback

  let q
  if (diary.dateKey) {
    q = supabase.from(diary.table).select(dateKey).limit(limit)
    if (fromDate) q = q.gte(dateKey, fromDate)
    if (toDate) q = q.lte(dateKey, toDate)
  } else {
    // dateKey를 모르더라도 최소 데이터를 얻어와 날짜 비슷한 키를 찾아본다.
    q = supabase.from(diary.table).select('*').limit(limit)
  }

  const { data, error } = await q

  if (error) {
    console.error(error)
    if (isMissingTableError(error)) {
      const found = await findWorkingTable(supabase, diaryTableCandidates)
      if (found) {
        resolved.diary = found
        saveResolved(resolved)
        return fetchDiaryMarkers({ fromDate, toDate, limit, onError })
      }
    }
    supabase = null
    onError?.('Supabase 연결 오류 - 로컬 데이터로 전환')
    const local = loadLocalData()
    return Array.from(new Set((local.diaries || []).map((entry) => entry[dateKeyFallback])))
  }

  const sample = data?.[0] || {}
  const key =
    diary.dateKey ||
    (sample.entry_date ? 'entry_date' : sample.date ? 'date' : Object.keys(sample || {})[0] || dateKeyFallback)

  const dates = (data || []).map((row) => row[key]).filter(Boolean)
  return Array.from(new Set(dates))
}

export function getConfigDefaults() {
  return defaultSupabaseConfig
}

export function getSupabaseClient() {
  return supabase
}

// ===== 팝업 간 실시간 동기화 =====
const SYNC_CHANNEL_NAME = 'diary-sync-channel'
let syncChannel = null

export function initSyncChannel() {
  if (typeof BroadcastChannel !== 'undefined') {
    syncChannel = new BroadcastChannel(SYNC_CHANNEL_NAME)
  }
  return syncChannel
}

export function getSyncChannel() {
  if (!syncChannel) {
    syncChannel = initSyncChannel()
  }
  return syncChannel
}

export function broadcastDataChange(type, data) {
  const channel = getSyncChannel()
  if (channel) {
    channel.postMessage({
      type: 'data-change',
      dataType: type, // 'calendar' or 'diary'
      data: data,
      timestamp: Date.now()
    })
  }
}

export function listenToDataChanges(callback) {
  const channel = getSyncChannel()
  if (channel) {
    channel.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'data-change') {
        callback(event.data)
      }
    })
  }
}

// ===== 이미지 업로드 =====

export async function uploadImageToSupabase(imageFile) {
  if (!supabase) return null

  try {
    // 파일명 생성
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${imageFile.name.split('.').pop()}`
    const filePath = `diary-images/${fileName}`

    // Supabase Storage에 업로드
    const { data, error } = await supabase.storage
      .from('diary-images')
      .upload(filePath, imageFile, {
        cacheControl: '3600',
        upsert: false
      })

    if (error) {
      console.error('이미지 업로드 오류:', error)
      return null
    }

    // 공개 URL 가져오기
    const { data: urlData } = supabase.storage
      .from('diary-images')
      .getPublicUrl(filePath)

    return urlData?.publicUrl || null
  } catch (error) {
    console.error('이미지 업로드 실패:', error)
    return null
  }
}

export async function convertImageToBase64(imageFile) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(imageFile)
  })
}
