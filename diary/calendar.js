import {
  fetchCalendarEvents,
  fetchDiaryMarkers,
  fetchDiaries,
  formatDate
} from './diary-utils.js'

const calendarGrid = document.querySelector('#calendar-grid')
const monthLabel = document.querySelector('#month-label')
const prevMonthBtn = document.querySelector('#prev-month')
const nextMonthBtn = document.querySelector('#next-month')
const weekdayRow = document.querySelector('#weekday-row')

const today = new Date()

const state = {
  month: new Date(today.getFullYear(), today.getMonth(), 1),
  selectedDate: formatDate(today),
  events: [],
  diaryDates: new Set()
}

const weekdays = ['월', '화', '수', '목', '금', '토', '일']

function buildMonthDays(month) {
  const year = month.getFullYear()
  const monthIndex = month.getMonth()
  const firstDay = new Date(year, monthIndex, 1)
  const startDay = new Date(firstDay)
  startDay.setDate(1 - ((firstDay.getDay() + 6) % 7)) // 주 시작을 월요일로 보정
  const days = []
  for (let i = 0; i < 42; i += 1) {
    const current = new Date(startDay)
    current.setDate(startDay.getDate() + i)
    days.push(current)
  }
  return days
}

function groupByDate(list, key) {
  return list.reduce((acc, item) => {
    const date = item[key]
    acc[date] = acc[date] || []
    acc[date].push(item)
    return acc
  }, {})
}

function renderWeekdays() {
  if (!weekdayRow) return
  weekdayRow.innerHTML = ''
  weekdays.forEach((day) => {
    const span = document.createElement('span')
    span.textContent = day
    weekdayRow.appendChild(span)
  })
}

function renderCalendar() {
  const days = buildMonthDays(state.month)
  const eventsByDate = groupByDate(state.events, 'event_date')
  const diaryDates = state.diaryDates

  monthLabel.textContent = `${state.month.getFullYear()}년 ${state.month.getMonth() + 1}월`
  calendarGrid.innerHTML = ''

  days.forEach((day) => {
    const dateStr = formatDate(day)
    const isToday = dateStr === formatDate(today)
    const isCurrent = day.getMonth() === state.month.getMonth()
    const isSelected = dateStr === state.selectedDate
    const eventCount = eventsByDate[dateStr]?.length || 0
    const hasDiary = diaryDates.has(dateStr)

    const cell = document.createElement('div')
    cell.className = `day ${isCurrent ? '' : 'muted'} ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}`
    const dots = eventCount
      ? Array(Math.min(eventCount, 4))
          .fill('<span class="dot event"></span>')
          .join('')
      : ''

    cell.innerHTML = `
      <div class="number">${day.getDate()}</div>
      <div class="markers">
        ${eventCount > 0 ? `<div class="dots">${dots}</div>` : ''}
        ${hasDiary ? '<span class="diary-flag done">✓</span>' : ''}
      </div>
    `

    cell.addEventListener('click', () => {
      state.selectedDate = dateStr
      renderCalendar()
      showDateDetail(dateStr)
    })

    calendarGrid.appendChild(cell)
  })
}


async function loadData() {
  const start = new Date(state.month.getFullYear(), state.month.getMonth(), 1)
  const end = new Date(state.month.getFullYear(), state.month.getMonth() + 1, 0)
  const fromDate = formatDate(start)
  const toDate = formatDate(end)

  const [events, diaryDates] = await Promise.all([
    fetchCalendarEvents({
      fromDate,
      toDate
    }),
    fetchDiaryMarkers({
      fromDate,
      toDate
    })
  ])

  state.events = events
  state.diaryDates = new Set(diaryDates)

  renderCalendar()
}
prevMonthBtn.addEventListener('click', () => {
  state.month = new Date(state.month.getFullYear(), state.month.getMonth() - 1, 1)
  loadData()
})

nextMonthBtn.addEventListener('click', () => {
  state.month = new Date(state.month.getFullYear(), state.month.getMonth() + 1, 1)
  loadData()
})

// 키보드 네비게이션 지원
document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft' && !e.target.matches('input, textarea')) {
    prevMonthBtn.click()
  } else if (e.key === 'ArrowRight' && !e.target.matches('input, textarea')) {
    nextMonthBtn.click()
  }
})

// ===== 날짜 상세 팝업 =====

const dateDetailModal = document.querySelector('#date-detail-modal')
const dateDetailTitle = document.querySelector('#date-detail-title')
const dateDetailBody = document.querySelector('#date-detail-body')
const closeDetailModal = document.querySelector('#close-detail-modal')

function formatDateDisplay(dateStr) {
  const date = new Date(dateStr)
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()
  const weekday = ['일', '월', '화', '수', '목', '금', '토'][date.getDay()]
  const today = new Date()
  const isToday = formatDate(today) === dateStr
  
  if (isToday) {
    return `오늘 (${month}월 ${day}일)`
  }
  return `${year}년 ${month}월 ${day}일 (${weekday})`
}

function getPriorityColor(priority) {
  const colors = {
    low: '#10b981',
    medium: '#3b82f6',
    high: '#f59e0b',
    urgent: '#ef4444'
  }
  return colors[priority] || colors.medium
}

function getPriorityLabel(priority) {
  const labels = {
    low: '낮음',
    medium: '보통',
    high: '높음',
    urgent: '긴급'
  }
  return labels[priority] || '보통'
}

function getStatusLabel(status) {
  const labels = {
    todo: '할 일',
    in_progress: '진행 중',
    done: '완료',
    cancelled: '취소'
  }
  return labels[status] || '할 일'
}

async function showDateDetail(dateStr) {
  if (!dateDetailModal || !dateDetailBody) return

  // 로딩 상태
  dateDetailBody.innerHTML = '<div class="date-detail-loading">로딩 중...</div>'
  dateDetailTitle.textContent = formatDateDisplay(dateStr)
  dateDetailModal.style.display = 'flex'

  try {
    // 해당 날짜의 일정과 일기 가져오기
    const [events, diaries] = await Promise.all([
      Promise.resolve(state.events.filter(e => e.event_date === dateStr)),
      fetchDiaries({ limit: 100 })
    ])

    const dateEvents = events || []
    const dateDiary = diaries.find(d => d.entry_date === dateStr) || null

    // HTML 생성
    let html = ''

    // 일정 섹션
    html += `
      <div class="date-detail-section">
        <div class="date-detail-section-header">
          <h4>일정 <span class="date-detail-count">${dateEvents.length}개</span></h4>
        </div>
        <div class="date-detail-events">
    `

    if (dateEvents.length === 0) {
      html += '<div class="date-detail-empty">일정이 없습니다.</div>'
    } else {
      dateEvents.forEach((event) => {
        const priorityColor = getPriorityColor(event.priority || 'medium')
        html += `
          <div class="date-detail-event-item">
            <div class="date-detail-event-header">
              <div class="date-detail-event-priority" style="background: ${priorityColor}"></div>
              <div class="date-detail-event-title">${event.title || '제목 없음'}</div>
            </div>
            ${event.assignee ? `<div class="date-detail-event-meta">의뢰자: ${event.assignee}</div>` : ''}
            ${event.status ? `<div class="date-detail-event-status">${getStatusLabel(event.status)}</div>` : ''}
            ${event.notes ? `<div class="date-detail-event-notes">${event.notes}</div>` : ''}
          </div>
        `
      })
    }

    html += `
        </div>
      </div>
    `

    // 일기 섹션
    html += `
      <div class="date-detail-section">
        <div class="date-detail-section-header">
          <h4>일기</h4>
        </div>
        <div class="date-detail-diary">
    `

    if (dateDiary) {
      html += `
        <div class="date-detail-diary-item">
          <div class="date-detail-diary-title">${dateDiary.title || '제목 없음'}</div>
          <div class="date-detail-diary-content">${dateDiary.content || ''}</div>
        </div>
      `
    } else {
      html += '<div class="date-detail-empty">일기가 없습니다.</div>'
    }

    html += `
        </div>
      </div>
    `

    dateDetailBody.innerHTML = html
  } catch (error) {
    console.error('날짜 상세 로딩 실패:', error)
    dateDetailBody.innerHTML = '<div class="date-detail-error">데이터를 불러오는 중 오류가 발생했습니다.</div>'
  }
}

function hideDateDetail() {
  if (dateDetailModal) {
    dateDetailModal.style.display = 'none'
  }
}

// 팝업 닫기 이벤트
closeDetailModal?.addEventListener('click', hideDateDetail)
dateDetailModal?.querySelector('.date-detail-overlay')?.addEventListener('click', hideDateDetail)

// ESC 키로 닫기
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && dateDetailModal?.style.display === 'flex') {
    hideDateDetail()
  }
})

document.addEventListener('DOMContentLoaded', () => {
  renderWeekdays()
  state.selectedDate = formatDate(today)
  loadData()
  // 3초마다 자동 새로고침
  setInterval(() => {
    loadData()
  }, 3000)
})
