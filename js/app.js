// ==================== КОНФИГУРАЦИЯ И ШИФРОВАНИЕ ====================
const STORAGE_KEY = 'encrypted_calendar_data_v1';
const SECRET_KEY = 'MySuperSecretKey_For_LocalCalendar_2024';

function loadData() {
    const encrypted = localStorage.getItem(STORAGE_KEY);
    if (!encrypted) return {};
    try {
        const bytes = CryptoJS.AES.decrypt(encrypted, SECRET_KEY);
        const decryptedStr = bytes.toString(CryptoJS.enc.Utf8);
        return JSON.parse(decryptedStr) || {};
    } catch (e) {
        console.error('Ошибка дешифровки данных', e);
        return {};
    }
}

function saveData(data) {
    const jsonStr = JSON.stringify(data);
    const encrypted = CryptoJS.AES.encrypt(jsonStr, SECRET_KEY).toString();
    localStorage.setItem(STORAGE_KEY, encrypted);
}

// ==================== СОСТОЯНИЕ ====================
let events = loadData();
let currentDate = new Date();
let selectedDate = new Date();
let pickerDate = new Date();
let editingEventInfo = null;

// ==================== УТИЛИТЫ ====================
const pad = n => String(n).padStart(2, '0');
const formatDateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const MONTHS_RU = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const MONTHS_GEN = ['Января','Февраля','Марта','Апреля','Мая','Июня','Июля','Августа','Сентября','Октября','Ноября','Декабря'];
const WEEKDAYS = ['Воскресенье','Понедельник','Вторник','Среда','Четверг','Пятница','Суббота'];
const WEEKDAYS_SHORT = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

function addHourToTime(timeStr) {
    if (!timeStr) return '10:00';
    let [h, m] = timeStr.split(':').map(Number);
    h = (h + 1) % 24;
    return `${pad(h)}:${pad(m)}`;
}

// ==================== DOM ЭЛЕМЕНТЫ ====================
const monthTitle = document.getElementById('monthTitle');
const daysGrid = document.getElementById('daysGrid');
const selectedDateLarge = document.getElementById('selectedDateLarge');
const eventSummary = document.getElementById('eventSummary');
const agendaList = document.getElementById('agendaList');

const monthView = document.getElementById('monthView');
const dayView = document.getElementById('dayView');
const dayTitle = document.getElementById('dayTitle');
const timelineWrapper = document.getElementById('timelineWrapper');
const horizontalDates = document.getElementById('horizontalDates');

const modal = document.getElementById('modal');
const modalTitle = document.getElementById('modalTitle');
const eventForm = document.getElementById('eventForm');
const evTitle = document.getElementById('evTitle');
const evDate = document.getElementById('evDate');
const evTime = document.getElementById('evTime');
const evDesc = document.getElementById('evDesc');

const monthPickerModal = document.getElementById('monthPickerModal');
const pickerYearLabel = document.getElementById('pickerYearLabel');
const pickerMonthsGrid = document.getElementById('pickerMonthsGrid');
const jumpToDateInput = document.getElementById('jumpToDateInput');

// ==================== ОТРИСОВКА КАЛЕНДАРЯ ====================
function renderMonth() {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    monthTitle.textContent = MONTHS_RU[month];
    
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    
    let startOffset = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
    let daysHtml = '';
    
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = startOffset - 1; i >= 0; i--) {
        daysHtml += `<div class="day-cell other-month"><span class="day-number">${prevMonthLastDay - i}</span></div>`;
    }
    
    const todayKey = formatDateKey(new Date());
    const selectedKey = formatDateKey(selectedDate);
    
    for (let i = 1; i <= lastDay.getDate(); i++) {
        const d = new Date(year, month, i);
        const key = formatDateKey(d);
        
        let classes = 'day-cell';
        if (key === todayKey) classes += ' today';
        if (key === selectedKey) classes += ' selected';
        
        const dayEvents = events[key] || [];
        let dotsHtml = '<div class="dots-container">';
        const numDots = Math.min(dayEvents.length, 3);
        
        for (let j = 0; j < numDots; j++) {
            dotsHtml += `<div class="dot"></div>`;
        }
        dotsHtml += '</div>';
        
        if (dayEvents.length === 0) dotsHtml = '<div class="dots-container"></div>';

        daysHtml += `
            <div class="${classes}" data-date="${key}">
                <span class="day-number">${i}</span>
                ${dotsHtml}
            </div>
        `;
    }
    
    const totalCells = Math.ceil((startOffset + lastDay.getDate()) / 7) * 7;
    const nextDaysNeeded = totalCells - (startOffset + lastDay.getDate());
    for (let i = 1; i <= nextDaysNeeded; i++) {
        daysHtml += `<div class="day-cell other-month"><span class="day-number">${i}</span></div>`;
    }
    
    daysGrid.innerHTML = daysHtml;
    
    document.querySelectorAll('.day-cell:not(.other-month)').forEach(cell => {
        cell.addEventListener('click', () => {
            const [y, m, d] = cell.dataset.date.split('-');
            selectedDate = new Date(y, m - 1, d);
            
            renderMonth(); 
            renderAgenda();

            monthView.classList.remove('active');
            dayView.classList.add('active');
            renderDayView();
        });
    });
}

// ==================== ОТРИСОВКА AGENDA ====================
function renderAgenda() {
    selectedDateLarge.textContent = selectedDate.getDate();
    const key = formatDateKey(selectedDate);
    const dayEvents = events[key] || [];
    
    dayEvents.sort((a, b) => a.time.localeCompare(b.time));
    
    const count = dayEvents.length;
    let eventWord = 'событий';
    if (count % 10 === 1 && count % 100 !== 11) eventWord = 'событие';
    else if ([2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100)) eventWord = 'события';
    
    eventSummary.textContent = `${count} ${eventWord}`;
    
    if (dayEvents.length === 0) {
        agendaList.innerHTML = '<div class="empty-state">Нет событий на этот день</div>';
        return;
    }
    
    agendaList.innerHTML = dayEvents.map(ev => `
        <div class="event-card">
            <div class="event-info">
                <span class="time">${ev.time}</span>
                <span class="title">${ev.title}</span>
                ${ev.desc ? `<span class="desc">${ev.desc}</span>` : ''}
            </div>
            <div class="event-actions">
                <button class="action-btn edit" onclick="editEvent('${key}', '${ev.id}')">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                </button>
                <button class="action-btn delete" onclick="deleteEvent('${key}', '${ev.id}')">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
            </div>
        </div>
    `).join('');
}

// ==================== ОТРИСОВКА ДНЯ (ТАЙМЛАЙН РЕФЕРЕНС) ====================
function renderDayView() {
    // Заголовок
    dayTitle.textContent = `${MONTHS_RU[selectedDate.getMonth()]} ${selectedDate.getFullYear()}`;
    
    // 1. Генерация горизонтальной ленты дат (на текущую неделю)
    let dateStripHtml = '';
    const startOfWeek = new Date(selectedDate);
    const dayOfWeek = startOfWeek.getDay();
    const diff = startOfWeek.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); 
    startOfWeek.setDate(diff); // Понедельник текущей недели

    for (let i = 0; i < 7; i++) {
        const d = new Date(startOfWeek);
        d.setDate(startOfWeek.getDate() + i);
        const key = formatDateKey(d);
        const isSelected = key === formatDateKey(selectedDate);
        
        dateStripHtml += `
            <div class="date-pill ${isSelected ? 'active' : ''}" onclick="selectDateFromStrip('${key}')">
                <span class="pill-day">${d.getDate()}</span>
                <span class="pill-weekday">${WEEKDAYS_SHORT[d.getDay()]}</span>
            </div>
        `;
    }
    horizontalDates.innerHTML = dateStripHtml;

    // 2. Генерация таймлайна
    const key = formatDateKey(selectedDate);
    const dayEvents = events[key] || [];
    dayEvents.sort((a, b) => a.time.localeCompare(b.time));

    let timelineHtml = '';

    // Заголовочная карточка (как на референсе)
    timelineHtml += `
        <div class="timeline-header-card">
            <div class="timeline-header-icon"></div>
            <span>Расписание дня</span>
        </div>
    `;

    // Список событий
    timelineHtml += `<div class="timeline-list">`;
    
    if (dayEvents.length === 0) {
        timelineHtml += `<div class="empty-state" style="margin: 20px 0;">Событий пока нет</div>`;
    } else {
        dayEvents.forEach(ev => {
            const endTime = addHourToTime(ev.time);
            timelineHtml += `
                <div class="timeline-item">
                    <div class="timeline-time">${ev.time}</div>
                    <div class="timeline-content">
                        <div class="timeline-card">
                            <div class="event-actions">
                                <button class="action-btn edit" onclick="editEvent('${key}', '${ev.id}')">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                                </button>
                                <button class="action-btn delete" onclick="deleteEvent('${key}', '${ev.id}')">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                </button>
                            </div>
                            <div class="event-title">${ev.title}</div>
                            <div class="event-time-range">${ev.time} - ${endTime}</div>
                            ${ev.desc ? `<div class="event-desc">${ev.desc}</div>` : ''}
                        </div>
                    </div>
                </div>
            `;
        });
    }
    timelineHtml += `</div>`;

    // Кнопка добавления внизу
    timelineHtml += `
        <button class="timeline-add-btn" onclick="openModal('${key}', '09:00')">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            Добавить событие
        </button>
    `;

    timelineWrapper.innerHTML = timelineHtml;

    // Прокрутка ленты дат к активному элементу
    setTimeout(() => {
        const activePill = document.querySelector('.date-pill.active');
        if (activePill) {
            activePill.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
    }, 50);
}

// Функция для выбора даты из горизонтальной ленты
window.selectDateFromStrip = (key) => {
    const [y, m, d] = key.split('-');
    selectedDate = new Date(y, m - 1, d);
    currentDate = new Date(selectedDate);
    renderDayView();
    renderMonth();
};

// ==================== МОДАЛЬНЫЕ ОКНА ====================
function openModal(dateKey, time) {
    editingEventInfo = null;
    modalTitle.textContent = 'Новое событие';
    
    evTitle.value = '';
    evDesc.value = '';
    evDate.value = dateKey;
    evTime.value = time || '09:00';
    
    modal.classList.add('active');
    setTimeout(() => evTitle.focus(), 300);
}

window.editEvent = (dateKey, id) => {
    const ev = events[dateKey].find(e => e.id === id);
    if (!ev) return;
    
    editingEventInfo = { dateKey, id };
    modalTitle.textContent = 'Редактировать событие';
    
    evTitle.value = ev.title;
    evDate.value = dateKey;
    evTime.value = ev.time;
    evDesc.value = ev.desc || '';
    
    modal.classList.add('active');
    setTimeout(() => evTitle.focus(), 300);
}

function closeModal() { modal.classList.remove('active'); }

window.deleteEvent = (dateKey, id) => {
    if (!confirm('Удалить событие?')) return;
    events[dateKey] = events[dateKey].filter(ev => ev.id !== id);
    if (events[dateKey].length === 0) delete events[dateKey];
    saveData(events);
    
    if (monthView.classList.contains('active')) {
        renderMonth();
        renderAgenda();
    } else {
        renderDayView();
    }
};

// ==================== ВЫБОР МЕСЯЦА ====================
function openMonthPicker() {
    pickerDate = new Date(currentDate); 
    updateMonthPickerUI();
    monthPickerModal.classList.add('active');
}

function updateMonthPickerUI() {
    pickerYearLabel.textContent = pickerDate.getFullYear();
    pickerMonthsGrid.innerHTML = '';
    
    MONTHS_RU.forEach((monthName, index) => {
        const btn = document.createElement('button');
        btn.className = 'picker-month-item';
        if (index === pickerDate.getMonth()) btn.classList.add('active');
        btn.textContent = monthName;
        
        btn.addEventListener('click', () => {
            currentDate = new Date(pickerDate.getFullYear(), index, 1);
            renderMonth();
            closeMonthPicker();
        });
        
        pickerMonthsGrid.appendChild(btn);
    });

    jumpToDateInput.value = formatDateKey(pickerDate);
}

function closeMonthPicker() { monthPickerModal.classList.remove('active'); }

// ==================== ОБРАБОТЧИКИ ====================
document.getElementById('prevMonthBtn').addEventListener('click', () => {
    currentDate.setMonth(currentDate.getMonth() - 1);
    renderMonth();
});
document.getElementById('nextMonthBtn').addEventListener('click', () => {
    currentDate.setMonth(currentDate.getMonth() + 1);
    renderMonth();
});

document.getElementById('todayBtn').addEventListener('click', () => {
    const now = new Date();
    currentDate = new Date(now);
    selectedDate = new Date(now);
    renderMonth();
    renderAgenda();
});

document.getElementById('addBtn').addEventListener('click', () => {
    openModal(formatDateKey(selectedDate), '09:00');
});

document.getElementById('monthPickerBtn').addEventListener('click', openMonthPicker);
document.getElementById('closeMonthPickerBtn').addEventListener('click', closeMonthPicker);
document.getElementById('pickerPrevYear').addEventListener('click', () => {
    pickerDate.setFullYear(pickerDate.getFullYear() - 1);
    updateMonthPickerUI();
});
document.getElementById('pickerNextYear').addEventListener('click', () => {
    pickerDate.setFullYear(pickerDate.getFullYear() + 1);
    updateMonthPickerUI();
});

jumpToDateInput.addEventListener('change', (e) => {
    const val = e.target.value;
    if (!val) return;
    const [y, m, d] = val.split('-');
    const newDate = new Date(y, m - 1, d);
    currentDate = new Date(newDate);
    selectedDate = new Date(newDate);
    renderMonth();
    renderAgenda();
    closeMonthPicker();
});

document.getElementById('goToDayBtn').addEventListener('click', () => {
    monthView.classList.remove('active');
    dayView.classList.add('active');
    renderDayView();
});

document.getElementById('backBtn').addEventListener('click', () => {
    dayView.classList.remove('active');
    monthView.classList.add('active');
    currentDate = new Date(selectedDate);
    renderMonth();
    renderAgenda();
});

document.getElementById('closeModalBtn').addEventListener('click', closeModal);
modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
monthPickerModal.addEventListener('click', (e) => { if (e.target === monthPickerModal) closeMonthPicker(); });

eventForm.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const newDateKey = evDate.value;
    if (!newDateKey) return;
    
    if (editingEventInfo) {
        events[editingEventInfo.dateKey] = events[editingEventInfo.dateKey].filter(ev => ev.id !== editingEventInfo.id);
        if (events[editingEventInfo.dateKey].length === 0) delete events[editingEventInfo.dateKey];
        
        if (!events[newDateKey]) events[newDateKey] = [];
        events[newDateKey].push({
            id: editingEventInfo.id,
            time: evTime.value,
            title: evTitle.value.trim(),
            desc: evDesc.value.trim()
        });
        
        editingEventInfo = null;
    } else {
        if (!events[newDateKey]) events[newDateKey] = [];
        events[newDateKey].push({
            id: Date.now().toString(),
            time: evTime.value,
            title: evTitle.value.trim(),
            desc: evDesc.value.trim()
        });
    }
    
    saveData(events);
    closeModal();
    
    if (dayView.classList.contains('active')) {
        renderDayView();
    } else {
        renderMonth();
        renderAgenda();
    }
});

// ==================== ИНИЦИАЛИЗАЦИЯ ====================
selectedDate = new Date();
currentDate = new Date();
renderMonth();
renderAgenda();