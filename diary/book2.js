import {
  fetchDiaries,
  storeDiary,
  formatDate,
  shiftDay,
  uploadImageToSupabase,
  convertImageToBase64
} from './diary-utils.js'

/**
 * Book2 페이지 메인 클래스
 * 왼쪽: 지난 일기 보기, 오른쪽: 일기 작성
 */
class Book2 {
  constructor() {
    this.elements = {
      yesterdayContent: document.querySelector('#yesterday-content'),
      priorContent: document.querySelector('#prior-content'),
      randomContent: document.querySelector('#random-content'),
      diaryForm: document.querySelector('#book2-diary-form'),
      imageInput: document.querySelector('#book2-image-input'),
      imagePreview: document.querySelector('#book2-image-preview'),
      imagePreviewContainer: document.querySelector('#book2-image-preview-container'),
      removeImageBtn: document.querySelector('#book2-remove-image-btn')
    }

    this.state = {
      diaries: [],
      selectedPriorEntry: null,
      pastDiariesRendered: false
    }

    this.init()
  }

  init() {
    this.setupEventListeners()
    this.initializeForm()
    this.loadData()
    // 3초마다 자동 새로고침
    this.autoRefreshInterval = setInterval(() => {
      this.loadData()
    }, 3000)
  }

  setupEventListeners() {
    // 폼 제출
    this.elements.diaryForm?.addEventListener('submit', (e) => this.handleSubmit(e))

    // 이미지 업로드
    this.elements.imageInput?.addEventListener('change', (e) => this.handleImageSelect(e))
    this.elements.removeImageBtn?.addEventListener('click', () => this.removeImage())
  }

  initializeForm() {
    // 오늘 날짜로 설정
    const dateInput = this.elements.diaryForm?.querySelector('#book2-entry-date')
    if (dateInput) {
      dateInput.value = formatDate(new Date())
    }
  }

  async loadData() {
    try {
      this.state.diaries = await fetchDiaries({ limit: 100 })
      this.render()
    } catch (error) {
      console.error('일기 로딩 실패:', error)
      this.state.diaries = []
      this.render()
    }
  }

  render() {
    // 지난 일기는 최초 로드 시에만 렌더링
    if (!this.state.pastDiariesRendered) {
      this.renderYesterday()
      this.renderPrior()
      this.renderRandom()
      this.state.pastDiariesRendered = true
    }
  }

  findEntryByDate(dateStr) {
    return this.state.diaries.find(d => d.entry_date === dateStr) || null
  }

  renderYesterday() {
    const today = new Date()
    const yesterdayDate = shiftDay(today, -1)
    const entry = this.findEntryByDate(yesterdayDate)

    if (!this.elements.yesterdayContent) return

    this.elements.yesterdayContent.innerHTML = ''

    if (!entry) {
      this.elements.yesterdayContent.innerHTML = '<div class="book2-empty">어제 일기가 없습니다.</div>'
      return
    }

    this.renderEntry(this.elements.yesterdayContent, entry)
  }

  renderPrior() {
    const today = new Date()
    const beforeYesterday = shiftDay(today, -2)
    const weekAgo = shiftDay(today, -7)

    // 그제~일주일 전 일기 찾기
    const candidates = [
      this.findEntryByDate(beforeYesterday),
      this.findEntryByDate(weekAgo)
    ].filter(Boolean)

    if (!this.elements.priorContent) return

    this.elements.priorContent.innerHTML = ''

    if (candidates.length === 0) {
      this.elements.priorContent.innerHTML = '<div class="book2-empty">일기가 없습니다.</div>'
      return
    }

    // 랜덤으로 하나 선택
    const entry = candidates[Math.floor(Math.random() * candidates.length)]
    this.state.selectedPriorEntry = entry
    this.renderEntry(this.elements.priorContent, entry)
  }

  renderRandom() {
    const today = new Date()
    const yesterdayDate = shiftDay(today, -1)
    const beforeYesterday = shiftDay(today, -2)
    const weekAgo = shiftDay(today, -7)

    // 어제, 그제, 일주일 전, 그리고 prior에서 선택된 일기를 제외한 랜덤 일기
    const excludedDates = new Set([
      yesterdayDate,
      beforeYesterday,
      weekAgo
    ])

    // prior에서 선택된 일기도 제외
    if (this.state.selectedPriorEntry) {
      excludedDates.add(this.state.selectedPriorEntry.entry_date)
    }

    const availableEntries = this.state.diaries.filter(
      d => !excludedDates.has(d.entry_date)
    )

    if (!this.elements.randomContent) return

    this.elements.randomContent.innerHTML = ''

    if (availableEntries.length === 0) {
      this.elements.randomContent.innerHTML = '<div class="book2-empty">일기가 없습니다.</div>'
      return
    }

    // 랜덤으로 하나 선택
    const randomEntry = availableEntries[Math.floor(Math.random() * availableEntries.length)]
    this.renderEntry(this.elements.randomContent, randomEntry)
  }

  renderEntry(container, entry) {
    if (!container || !entry) return

    const date = new Date(entry.entry_date)
    const month = date.getMonth() + 1
    const day = date.getDate()
    const weekday = ['일', '월', '화', '수', '목', '금', '토'][date.getDay()]

    let html = `
      <div class="book2-entry-card">
        <div class="book2-entry-date">${month}월 ${day}일 (${weekday})</div>
        <h3 class="book2-entry-title">${entry.title || '제목 없음'}</h3>
        <div class="book2-entry-text">${entry.content || ''}</div>
    `

    if (entry.image_url) {
      html += `
        <div class="book2-entry-image">
          <img src="${entry.image_url}" alt="일기 이미지" />
        </div>
      `
    }

    html += `</div>`

    container.innerHTML = html
  }

  handleImageSelect(event) {
    const file = event.target.files[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      alert('이미지 파일만 업로드할 수 있습니다.')
      return
    }

    const reader = new FileReader()
    reader.onload = (e) => {
      if (this.elements.imagePreview) {
        this.elements.imagePreview.src = e.target.result
      }
      if (this.elements.imagePreviewContainer) {
        this.elements.imagePreviewContainer.style.display = 'block'
      }
    }
    reader.readAsDataURL(file)
  }

  removeImage() {
    if (this.elements.imageInput) {
      this.elements.imageInput.value = ''
    }
    if (this.elements.imagePreview) {
      this.elements.imagePreview.src = ''
    }
    if (this.elements.imagePreviewContainer) {
      this.elements.imagePreviewContainer.style.display = 'none'
    }
  }

  async handleSubmit(event) {
    event.preventDefault()
    const formData = new FormData(event.target)

    // 이미지 처리
    let imageUrl = null
    const imageFile = formData.get('entryImage')
    if (imageFile && imageFile.size > 0) {
      try {
        imageUrl = await uploadImageToSupabase(imageFile) || await convertImageToBase64(imageFile)
      } catch (error) {
        console.error('이미지 업로드 실패:', error)
        imageUrl = await convertImageToBase64(imageFile)
      }
    }

    const payload = {
      entry_date: formData.get('entryDate'),
      title: formData.get('entryTitle'),
      content: formData.get('entryContent'),
      image_url: imageUrl
    }

    try {
      const entry = await storeDiary(payload)
      this.state.diaries.unshift(entry)
      this.render()
      
      // 폼 초기화
      this.elements.diaryForm?.reset()
      this.removeImage()
      this.initializeForm()

      // 성공 메시지
      const submitBtn = event.target.querySelector('button[type="submit"]')
      const originalText = submitBtn.textContent
      submitBtn.textContent = '저장됨!'
      submitBtn.style.background = 'linear-gradient(135deg, #ff9ec5 0%, #ff7eb3 100%)'

      setTimeout(() => {
        submitBtn.textContent = originalText
        submitBtn.style.background = ''
      }, 2000)
    } catch (error) {
      console.error('일기 저장 실패:', error)
      alert('일기 저장에 실패했습니다.')
    }
  }
}

// 초기화
document.addEventListener('DOMContentLoaded', () => {
  new Book2()
})
