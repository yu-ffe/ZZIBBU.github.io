import {
  fetchCalendarEvents,
  updateCalendarEvent,
  formatDate,
  initSyncChannel,
  listenToDataChanges
} from './diary-utils.js'

/**
 * 작업 대시보드
 * 오늘, 이번주, 지난 작업을 상태별로 표시
 */
class WorkDashboard {
  constructor() {
    this.elements = {
      refreshBtn: document.querySelector('#refresh-btn'),
      todayTomorrowList: document.querySelector('#today-tomorrow-list'),
      weekList: document.querySelector('#week-list'),
      todayTomorrowCount: document.querySelector('#today-tomorrow-count'),
      weekCount: document.querySelector('#week-count')
    }

    this.state = {
      events: [],
      filters: {
        todayTomorrow: 'all',
        week: 'all'
      }
    }

    this.today = new Date()
    this.init()
  }

  init() {
    this.setupEventListeners()
    this.setupSyncChannel()
    this.loadData()
    // 3초마다 자동 새로고침
    this.autoRefreshInterval = setInterval(() => {
      this.loadData()
    }, 3000)
  }

  setupSyncChannel() {
    // 동기화 채널 초기화
    initSyncChannel()
    
    // 다른 팝업에서 데이터 변경 시 자동 새로고침
    listenToDataChanges((message) => {
      if (message.dataType === 'calendar') {
        // 캘린더 데이터가 변경되었으면 다시 로드
        this.loadData()
      }
    })
  }

  setupEventListeners() {
    // 새로고침 버튼
    this.elements.refreshBtn?.addEventListener('click', () => this.loadData())

    // 필터 버튼
    document.querySelectorAll('.filter-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const section = e.target.closest('.work-section')
        const filter = e.target.dataset.filter
        const sectionId = section?.id || this.getSectionId(section)

        // 활성 상태 토글
        section?.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'))
        e.target.classList.add('active')

        // 필터 상태 업데이트
        if (sectionId === 'today-tomorrow') {
          this.state.filters.todayTomorrow = filter
        } else if (sectionId === 'week') {
          this.state.filters.week = filter
        }

        this.render()
      })
    })
  }

  getSectionId(section) {
    if (!section) return ''
    const header = section.querySelector('.work-section-header h3')
    if (header?.textContent.includes('오늘/내일')) return 'today-tomorrow'
    if (header?.textContent.includes('이번주')) return 'week'
    return ''
  }

  async loadData() {
    try {
      // 최근 3개월치 일정 로드
      const today = new Date()
      const start = new Date(today.getFullYear(), today.getMonth() - 1, 1)
      const end = new Date(today.getFullYear(), today.getMonth() + 2, 0)
      const fromDate = formatDate(start)
      const toDate = formatDate(end)

      this.state.events = await fetchCalendarEvents({ fromDate, toDate })
      this.render()
    } catch (error) {
      console.error('작업 로딩 실패:', error)
      this.state.events = []
      this.render()
    }
  }

  getTodayDate() {
    return formatDate(this.today)
  }

  getTomorrowDate() {
    const tomorrow = new Date(this.today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    return formatDate(tomorrow)
  }

  getWeekStart() {
    const date = new Date(this.today)
    const day = date.getDay()
    const diff = date.getDate() - day + (day === 0 ? -6 : 1) // 월요일 기준
    return new Date(date.setDate(diff))
  }

  getWeekEnd() {
    const start = this.getWeekStart()
    const end = new Date(start)
    end.setDate(start.getDate() + 6)
    return end
  }

  filterEvents(events, dateFilter, statusFilter) {
    return events.filter((event) => {
      // 날짜 필터
      const eventDate = new Date(event.event_date)
      const today = new Date(this.getTodayDate())
      const tomorrow = new Date(this.getTomorrowDate())
      const weekStart = this.getWeekStart()
      const weekEnd = this.getWeekEnd()

      let matchesDate = false
      if (dateFilter === 'today-tomorrow') {
        const eventDateStr = formatDate(eventDate)
        matchesDate = eventDateStr === this.getTodayDate() || eventDateStr === this.getTomorrowDate()
      } else if (dateFilter === 'week') {
        matchesDate = eventDate >= weekStart && eventDate <= weekEnd
      }

      if (!matchesDate) return false

      // 상태 필터
      if (statusFilter === 'all') return true
      return event.status === statusFilter
    })
  }

  sortByDatePriority(events) {
    const today = this.getTodayDate()
    const tomorrow = this.getTomorrowDate()
    
    return events.sort((a, b) => {
      const aDate = formatDate(new Date(a.event_date))
      const bDate = formatDate(new Date(b.event_date))
      
      // 오늘이 우선
      if (aDate === today && bDate !== today) return -1
      if (aDate !== today && bDate === today) return 1
      
      // 그 다음 내일
      if (aDate === tomorrow && bDate !== tomorrow) return -1
      if (aDate !== tomorrow && bDate === tomorrow) return 1
      
      // 날짜순 정렬
      return aDate.localeCompare(bDate)
    })
  }

  render() {
    // 오늘/내일 작업 (오늘 우선 정렬)
    const todayTomorrowEvents = this.sortByDatePriority(
      this.filterEvents(
        this.state.events,
        'today-tomorrow',
        this.state.filters.todayTomorrow
      )
    )

    // 이번주 작업
    const weekEvents = this.filterEvents(
      this.state.events,
      'week',
      this.state.filters.week
    )

    // 개수 업데이트
    if (this.elements.todayTomorrowCount) {
      this.elements.todayTomorrowCount.textContent = `${todayTomorrowEvents.length}개`
    }
    if (this.elements.weekCount) {
      this.elements.weekCount.textContent = `${weekEvents.length}개`
    }

    // 목록 렌더링
    this.renderList(this.elements.todayTomorrowList, todayTomorrowEvents)
    this.renderList(this.elements.weekList, weekEvents)
  }

  renderList(container, events) {
    if (!container) return

    if (events.length === 0) {
      container.innerHTML = '<div class="work-empty">작업이 없습니다.</div>'
      return
    }

    container.innerHTML = events
      .map((event) => this.createWorkItem(event))
      .join('')
    
    // 이벤트 리스너 추가
    this.attachItemListeners(container)
  }

  attachItemListeners(container) {
    // 상태 변경 버튼
    container.querySelectorAll('.work-item-status').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        const item = e.target.closest('.work-item')
        const eventId = item?.dataset.eventId
        if (eventId) {
          this.showStatusMenu(item, eventId)
        }
      })
    })

    // 우선순위 변경 버튼
    container.querySelectorAll('.work-item-priority-badge').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        const item = e.target.closest('.work-item')
        const eventId = item?.dataset.eventId
        if (eventId) {
          this.showPriorityMenu(item, eventId)
        }
      })
    })

    // 카드 클릭 시 수정 모달
    container.querySelectorAll('.work-item').forEach((item) => {
      item.addEventListener('click', (e) => {
        // 상태 버튼이나 우선순위 배지 클릭이 아닐 때만
        if (!e.target.closest('.work-item-status') && !e.target.closest('.work-item-priority-badge')) {
          const eventId = item.dataset.eventId
          if (eventId) {
            const event = this.state.events.find(e => e.id === eventId)
            if (event) {
              this.showEditModal(event)
            }
          }
        }
      })
    })
  }

  createWorkItem(event) {
    const priorityColor = this.getPriorityColor(event.priority || 'medium')
    const priorityLabel = this.getPriorityLabel(event.priority || 'medium')
    const priorityBadge = this.getPriorityBadgeColor(event.priority || 'medium')
    const statusLabel = this.getStatusLabel(event.status || 'todo')
    const statusClass = this.getStatusClass(event.status || 'todo')
    const date = new Date(event.event_date)
    const month = date.getMonth() + 1
    const day = date.getDate()
    const weekday = ['일', '월', '화', '수', '목', '금', '토'][date.getDay()]
    const eventDateStr = formatDate(date)
    const today = this.getTodayDate()
    const tomorrow = this.getTomorrowDate()
    
    let dateLabel = `${month}월 ${day}일 (${weekday})`
    if (eventDateStr === today) {
      dateLabel = `오늘 (${month}월 ${day}일)`
    } else if (eventDateStr === tomorrow) {
      dateLabel = `내일 (${month}월 ${day}일)`
    }

    return `
      <div class="work-item" data-event-id="${event.id}">
        <div class="work-item-header">
          <div class="work-item-priority" style="background: ${priorityColor}"></div>
          <div class="work-item-title">${event.title || '제목 없음'}</div>
          <div class="work-item-header-right">
            <span class="work-item-priority-badge" style="background: ${priorityBadge.bg}; color: ${priorityBadge.text}; border-color: ${priorityBadge.border};" title="클릭하여 우선순위 변경">${priorityLabel}</span>
            <span class="work-item-status ${statusClass}" title="클릭하여 상태 변경">${statusLabel}</span>
          </div>
        </div>
        <div class="work-item-body">
          ${event.assignee ? `<div class="work-item-meta"><span class="work-item-label">의뢰자:</span> ${event.assignee}</div>` : ''}
          <div class="work-item-meta"><span class="work-item-label">날짜:</span> ${dateLabel}</div>
          ${event.notes ? `<div class="work-item-notes">${event.notes}</div>` : ''}
        </div>
      </div>
    `
  }

  getPriorityColor(priority) {
    const colors = {
      low: '#7FB069',
      medium: '#5B9BD5',
      high: '#D4A574',
      urgent: '#D97794'
    }
    return colors[priority] || colors.medium
  }

  getPriorityBadgeColor(priority) {
    const badgeColors = {
      low: { bg: '#e8f5e9', text: '#2e7d32', border: '#7FB069' },
      medium: { bg: '#e3f2fd', text: '#1565c0', border: '#5B9BD5' },
      high: { bg: '#fff3e0', text: '#e65100', border: '#D4A574' },
      urgent: { bg: '#fce4ec', text: '#c2185b', border: '#D97794' }
    }
    return badgeColors[priority] || badgeColors.medium
  }

  getPriorityLabel(priority) {
    const labels = {
      low: '낮음',
      medium: '보통',
      high: '높음',
      urgent: '긴급'
    }
    return labels[priority] || labels.medium
  }

  getStatusLabel(status) {
    const labels = {
      todo: '할 일',
      in_progress: '진행 중',
      done: '완료',
      cancelled: '취소'
    }
    return labels[status] || '할 일'
  }

  getStatusClass(status) {
    const classes = {
      todo: 'status-todo',
      in_progress: 'status-progress',
      done: 'status-done',
      cancelled: 'status-cancelled'
    }
    return classes[status] || 'status-todo'
  }

  showStatusMenu(item, eventId) {
    // 기존 메뉴 제거
    const existingMenu = document.querySelector('.work-status-menu')
    if (existingMenu) {
      existingMenu.remove()
    }

    const statuses = [
      { value: 'todo', label: '할 일' },
      { value: 'in_progress', label: '진행 중' },
      { value: 'done', label: '완료' },
      { value: 'cancelled', label: '취소' }
    ]

    const menu = document.createElement('div')
    menu.className = 'work-status-menu'
    menu.innerHTML = statuses.map(status => `
      <button type="button" class="work-status-menu-item" data-status="${status.value}">
        ${status.label}
      </button>
    `).join('')

    const statusBtn = item.querySelector('.work-item-status')
    const rect = statusBtn.getBoundingClientRect()
    menu.style.position = 'fixed'
    menu.style.top = `${rect.bottom + 4}px`
    menu.style.left = `${rect.left}px`
    menu.style.zIndex = '1000'

    document.body.appendChild(menu)

    // 메뉴 아이템 클릭
    menu.querySelectorAll('.work-status-menu-item').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation()
        const newStatus = btn.dataset.status
        await this.updateEventStatus(eventId, newStatus)
        menu.remove()
      })
    })

    // 외부 클릭 시 닫기
    const closeMenu = (e) => {
      if (!menu.contains(e.target) && e.target !== statusBtn) {
        menu.remove()
        document.removeEventListener('click', closeMenu)
      }
    }
    setTimeout(() => {
      document.addEventListener('click', closeMenu)
    }, 0)
  }

  async updateEventStatus(eventId, newStatus) {
    try {
      await updateCalendarEvent(eventId, { status: newStatus })
      // 데이터 다시 로드
      await this.loadData()
    } catch (error) {
      console.error('상태 업데이트 실패:', error)
      alert('상태 변경에 실패했습니다.')
    }
  }

  showPriorityMenu(item, eventId) {
    // 기존 메뉴 제거
    const existingMenu = document.querySelector('.work-priority-menu')
    if (existingMenu) {
      existingMenu.remove()
    }

    const priorities = [
      { value: 'low', label: '낮음' },
      { value: 'medium', label: '보통' },
      { value: 'high', label: '높음' },
      { value: 'urgent', label: '긴급' }
    ]

    const menu = document.createElement('div')
    menu.className = 'work-priority-menu'
    menu.innerHTML = priorities.map(priority => `
      <button type="button" class="work-priority-menu-item" data-priority="${priority.value}">
        ${priority.label}
      </button>
    `).join('')

    const priorityBtn = item.querySelector('.work-item-priority-badge')
    const rect = priorityBtn.getBoundingClientRect()
    menu.style.position = 'fixed'
    menu.style.top = `${rect.bottom + 4}px`
    menu.style.left = `${rect.left}px`
    menu.style.zIndex = '1000'

    document.body.appendChild(menu)

    // 메뉴 아이템 클릭
    menu.querySelectorAll('.work-priority-menu-item').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation()
        const newPriority = btn.dataset.priority
        await this.updateEventPriority(eventId, newPriority)
        menu.remove()
      })
    })

    // 외부 클릭 시 닫기
    const closeMenu = (e) => {
      if (!menu.contains(e.target) && e.target !== priorityBtn) {
        menu.remove()
        document.removeEventListener('click', closeMenu)
      }
    }
    setTimeout(() => {
      document.addEventListener('click', closeMenu)
    }, 0)
  }

  async updateEventPriority(eventId, newPriority) {
    try {
      await updateCalendarEvent(eventId, { priority: newPriority })
      // 데이터 다시 로드
      await this.loadData()
    } catch (error) {
      console.error('우선순위 업데이트 실패:', error)
      alert('우선순위 변경에 실패했습니다.')
    }
  }

  showEditModal(event) {
    // 기존 모달 제거
    const existingModal = document.querySelector('.work-edit-modal')
    if (existingModal) {
      existingModal.remove()
    }

    const modal = document.createElement('div')
    modal.className = 'work-edit-modal'
    modal.innerHTML = `
      <div class="work-edit-overlay"></div>
      <div class="work-edit-content">
        <div class="work-edit-header">
          <h3>작업 수정</h3>
          <button type="button" class="work-edit-close" aria-label="닫기">×</button>
        </div>
        <div class="work-edit-body">
          <div class="field">
            <label class="field-label">작업명</label>
            <input type="text" id="edit-title" value="${(event.title || '').replace(/"/g, '&quot;')}" class="work-edit-input" />
          </div>
          <div class="field">
            <label class="field-label">내용</label>
            <textarea id="edit-notes" class="work-edit-textarea" rows="4">${(event.notes || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</textarea>
          </div>
          <div class="field">
            <label class="field-label">의뢰자</label>
            <input type="text" id="edit-assignee" value="${(event.assignee || '').replace(/"/g, '&quot;')}" class="work-edit-input" />
          </div>
        </div>
        <div class="work-edit-actions">
          <button type="button" class="work-edit-cancel">취소</button>
          <button type="button" class="work-edit-save">저장</button>
        </div>
      </div>
    `

    document.body.appendChild(modal)

    // 닫기 버튼
    const closeBtn = modal.querySelector('.work-edit-close')
    const cancelBtn = modal.querySelector('.work-edit-cancel')
    const overlay = modal.querySelector('.work-edit-overlay')
    
    const closeModal = () => modal.remove()
    closeBtn?.addEventListener('click', closeModal)
    cancelBtn?.addEventListener('click', closeModal)
    overlay?.addEventListener('click', closeModal)

    // 저장 버튼
    const saveBtn = modal.querySelector('.work-edit-save')
    saveBtn?.addEventListener('click', async () => {
      const title = modal.querySelector('#edit-title').value.trim()
      const notes = modal.querySelector('#edit-notes').value.trim()
      const assignee = modal.querySelector('#edit-assignee').value.trim()

      if (!title) {
        alert('작업명을 입력해주세요.')
        return
      }

      try {
        await updateCalendarEvent(event.id, {
          title,
          notes: notes || null,
          assignee: assignee || null
        })
        await this.loadData()
        closeModal()
      } catch (error) {
        console.error('작업 수정 실패:', error)
        alert('작업 수정에 실패했습니다.')
      }
    })

    // ESC 키로 닫기
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        closeModal()
        document.removeEventListener('keydown', handleEsc)
      }
    }
    document.addEventListener('keydown', handleEsc)
  }
}

// 초기화
document.addEventListener('DOMContentLoaded', () => {
  new WorkDashboard()
})
