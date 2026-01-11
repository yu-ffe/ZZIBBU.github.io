import {
  fetchCalendarEvents,
  storeCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  formatDate,
  initSyncChannel,
  listenToDataChanges
} from './diary-utils.js'

/**
 * 일정 관리 페이지
 * 좌측: 캘린더, 우측: 일정 추가/수정/삭제
 */
class EventManager {
  constructor() {
    // DOM 요소
    this.elements = {
      eventForm: document.querySelector('#event-form'),
      eventListSection: document.querySelector('#event-list-section'),
      eventList: document.querySelector('#event-list'),
      dateSelector: document.querySelector('#date-selector'),
      dateDisplay: document.querySelector('#date-display'),
      dateDisplayText: document.querySelector('#date-display .date-display-text'),
      prevDateBtn: document.querySelector('#prev-date-btn'),
      nextDateBtn: document.querySelector('#next-date-btn'),
      eventCount: document.querySelector('#event-count'),
      addEventBtn: document.querySelector('#add-event-btn'),
      closeFormBtn: document.querySelector('#close-form-btn'),
      cancelEventBtn: document.querySelector('#cancel-event-btn'),
      deleteEventBtn: document.querySelector('#delete-event-btn'),
      eventFormTitle: document.querySelector('#event-form-title'),
      menuBtn: document.querySelector('#menu-btn')
    }

    // 상태
    this.state = {
      selectedDate: formatDate(new Date()),
      events: [],
      editingEvent: null
    }

    this.init()
  }

  init() {
    // 초기 날짜 설정
    if (this.elements.dateSelector) {
      this.elements.dateSelector.value = this.state.selectedDate
    }
    
    this.setupEventListeners()
    this.setupSyncChannel()
    this.updateDateDisplay()
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

  changeDate(days) {
    const currentDate = new Date(this.state.selectedDate)
    currentDate.setDate(currentDate.getDate() + days)
    this.state.selectedDate = formatDate(currentDate)
    
    if (this.elements.dateSelector) {
      this.elements.dateSelector.value = this.state.selectedDate
    }
    
    this.updateDateDisplay()
    this.renderEventList()
  }

  updateDateDisplay() {
    if (!this.elements.dateDisplayText) return
    
    const date = new Date(this.state.selectedDate)
    const year = date.getFullYear()
    const month = date.getMonth() + 1
    const day = date.getDate()
    const weekday = ['일', '월', '화', '수', '목', '금', '토'][date.getDay()]
    
    const today = new Date()
    const isToday = formatDate(today) === this.state.selectedDate
    
    if (isToday) {
      this.elements.dateDisplayText.textContent = `오늘 (${month}월 ${day}일)`
    } else {
      this.elements.dateDisplayText.textContent = `${year}년 ${month}월 ${day}일 (${weekday})`
    }
  }

  setupEventListeners() {
    // 일정 관리 버튼
    this.elements.addEventBtn?.addEventListener('click', () => this.showAddForm())
    this.elements.closeFormBtn?.addEventListener('click', () => this.hideForm())
    this.elements.cancelEventBtn?.addEventListener('click', () => this.hideForm())
    this.elements.deleteEventBtn?.addEventListener('click', () => this.handleDelete())
    this.elements.menuBtn?.addEventListener('click', () => this.handleMenu())

    // 날짜 선택
    this.elements.dateSelector?.addEventListener('change', (e) => {
      this.state.selectedDate = e.target.value
      this.updateDateDisplay()
      this.renderEventList()
    })

    // 날짜 표시 클릭 시 date input 열기
    this.elements.dateDisplay?.addEventListener('click', () => {
      this.elements.dateSelector?.showPicker?.() || this.elements.dateSelector?.click()
    })

    // 날짜 네비게이션
    this.elements.prevDateBtn?.addEventListener('click', () => this.changeDate(-1))
    this.elements.nextDateBtn?.addEventListener('click', () => this.changeDate(1))

    // 폼 제출
    this.elements.eventForm?.addEventListener('submit', (e) => this.handleSubmit(e))
  }

  // ===== 데이터 로딩 =====

  async loadData() {
    // 최근 3개월치 일정 로드
    const today = new Date()
    const start = new Date(today.getFullYear(), today.getMonth() - 1, 1)
    const end = new Date(today.getFullYear(), today.getMonth() + 2, 0)
    const fromDate = formatDate(start)
    const toDate = formatDate(end)

    try {
      this.state.events = await fetchCalendarEvents({ fromDate, toDate })
      this.renderEventList()
    } catch (error) {
      console.error('일정 로딩 실패:', error)
      this.state.events = []
      this.renderEventList()
    }
  }

  // ===== 일정 목록 렌더링 =====

  renderEventList() {
    if (!this.elements.eventList) return

    // 선택한 날짜의 일정만 필터링
    const selectedEvents = this.state.events.filter(
      (event) => event.event_date === this.state.selectedDate
    )

    // 개수 업데이트
    if (this.elements.eventCount) {
      this.elements.eventCount.textContent = `${selectedEvents.length}개`
    }

    // 일정 목록 렌더링
    this.elements.eventList.innerHTML = ''

    if (selectedEvents.length === 0) {
      const date = new Date(this.state.selectedDate)
      const month = date.getMonth() + 1
      const day = date.getDate()
      this.elements.eventList.innerHTML = `
        <div class="event-empty">
          <p>${month}월 ${day}일에 일정이 없습니다.</p>
          <p class="muted">+ 버튼을 눌러 일정을 추가하세요.</p>
        </div>
      `
      return
    }

    // 선택한 날짜의 일정 표시
    selectedEvents.forEach((event) => {
      const eventItem = this.createEventItem(event)
      this.elements.eventList.appendChild(eventItem)
    })
  }

  createEventItem(event) {
    const item = document.createElement('div')
    item.className = 'event-item'
    item.dataset.eventId = event.id

    const priorityColors = {
      low: '#10b981',
      medium: '#3b82f6',
      high: '#f59e0b',
      urgent: '#ef4444'
    }

    const statusLabels = {
      todo: '할 일',
      in_progress: '진행 중',
      done: '완료',
      cancelled: '취소'
    }

    const priority = event.priority || 'medium'
    const status = event.status || 'todo'

    item.innerHTML = `
      <div class="event-item-header">
        <div class="event-item-title-row">
          <span class="event-item-priority" style="background: ${priorityColors[priority] || priorityColors.medium}"></span>
          <h5 class="event-item-title">${event.title || '제목 없음'}</h5>
        </div>
        <button type="button" class="event-item-edit" data-event-id="${event.id}" aria-label="수정">✎</button>
      </div>
      <div class="event-item-body">
        ${event.assignee ? `<div class="event-item-meta"><span class="event-item-label">의뢰자:</span> ${event.assignee}</div>` : ''}
        <div class="event-item-meta">
          <span class="event-item-label">상태:</span>
          <span class="event-item-status">${statusLabels[status] || status}</span>
        </div>
        ${event.notes ? `<div class="event-item-notes">${event.notes}</div>` : ''}
      </div>
    `

    // 수정 버튼 이벤트
    const editBtn = item.querySelector('.event-item-edit')
    editBtn?.addEventListener('click', (e) => {
      e.stopPropagation()
      this.editEvent(event)
    })

    // 클릭 시 수정
    item.addEventListener('click', () => {
      this.editEvent(event)
    })

    return item
  }

  // ===== 폼 관리 =====

  showAddForm() {
    if (!this.elements.eventForm || !this.elements.eventListSection) return

    this.state.editingEvent = null
    this.elements.eventForm.reset()
    
    // 선택한 날짜로 설정 (또는 오늘 날짜)
    const dateInput = this.elements.eventForm.querySelector('#event-date')
    if (dateInput) {
      dateInput.value = this.state.selectedDate || formatDate(new Date())
    }

    // 기본값 설정
    const prioritySelect = this.elements.eventForm.querySelector('#event-priority')
    if (prioritySelect) prioritySelect.value = 'medium'
    
    const statusSelect = this.elements.eventForm.querySelector('#event-status')
    if (statusSelect) statusSelect.value = 'todo'

    // 삭제 버튼 숨기기
    if (this.elements.deleteEventBtn) {
      this.elements.deleteEventBtn.style.display = 'none'
    }

    if (this.elements.eventFormTitle) {
      this.elements.eventFormTitle.textContent = '일정 추가'
    }

    this.elements.eventForm.style.display = 'block'
    this.elements.eventListSection.style.display = 'none'
  }

  editEvent(event) {
    if (!this.elements.eventForm || !this.elements.eventListSection) return

    this.state.editingEvent = event

    // 폼에 데이터 채우기
    const titleInput = this.elements.eventForm.querySelector('#event-title')
    if (titleInput) titleInput.value = event.title || ''

    const dateInput = this.elements.eventForm.querySelector('#event-date')
    if (dateInput) dateInput.value = event.event_date || ''

    const assigneeInput = this.elements.eventForm.querySelector('#event-assignee')
    if (assigneeInput) assigneeInput.value = event.assignee || ''

    const prioritySelect = this.elements.eventForm.querySelector('#event-priority')
    if (prioritySelect) prioritySelect.value = event.priority || 'medium'

    const statusSelect = this.elements.eventForm.querySelector('#event-status')
    if (statusSelect) statusSelect.value = event.status || 'todo'

    const notesTextarea = this.elements.eventForm.querySelector('#event-notes')
    if (notesTextarea) notesTextarea.value = event.notes || ''

    // 삭제 버튼 표시
    if (this.elements.deleteEventBtn) {
      this.elements.deleteEventBtn.style.display = 'block'
    }

    if (this.elements.eventFormTitle) {
      this.elements.eventFormTitle.textContent = '일정 수정'
    }

    this.elements.eventForm.style.display = 'block'
    this.elements.eventListSection.style.display = 'none'
  }

  hideForm() {
    if (!this.elements.eventForm || !this.elements.eventListSection) return

    this.state.editingEvent = null
    this.elements.eventForm.style.display = 'none'
    this.elements.eventListSection.style.display = 'block'
    this.elements.eventForm.reset()
  }

  // ===== 일정 저장/삭제 =====

  async handleSubmit(event) {
    event.preventDefault()
    const formData = new FormData(event.target)

    const payload = {
      title: formData.get('title'),
      event_date: formData.get('event_date'),
      assignee: formData.get('assignee') || null,
      priority: formData.get('priority') || 'medium',
      status: formData.get('status') || 'todo',
      notes: formData.get('notes') || null
    }

    try {
      if (this.state.editingEvent) {
        // 수정: updateCalendarEvent 사용
        await updateCalendarEvent(this.state.editingEvent.id, payload)
      } else {
        // 추가
        await storeCalendarEvent(payload)
      }

      // 데이터 다시 로드
      await this.loadData()
      this.hideForm()

      // 성공 메시지
      const submitBtn = event.target.querySelector('button[type="submit"]')
      const originalText = submitBtn.textContent
      submitBtn.textContent = '저장됨!'
      submitBtn.style.background = '#10b981'

      setTimeout(() => {
        submitBtn.textContent = originalText
        submitBtn.style.background = ''
      }, 2000)
    } catch (error) {
      console.error('일정 저장 실패:', error)
      alert('일정 저장에 실패했습니다.')
    }
  }

  async handleDelete() {
    if (!this.state.editingEvent) return

    if (!confirm('정말 이 일정을 삭제하시겠습니까?')) return

    try {
      await deleteCalendarEvent(this.state.editingEvent.id)
      await this.loadData()
      this.hideForm()
    } catch (error) {
      console.error('일정 삭제 실패:', error)
      alert('일정 삭제에 실패했습니다.')
    }
  }

  handleMenu() {
    // 메뉴 기능 (추후 확장 가능)
    console.log('메뉴 클릭')
  }
}

// 초기화
document.addEventListener('DOMContentLoaded', () => {
  new EventManager()
})
