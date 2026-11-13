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

let isCalendarExpanded = true; 
let inlineFormTime = null;
let expandedEvents = new Set(); 

// ==================== УТИЛИТЫ ====================
const pad = n => String(n).padStart(2, '0');
const formatDateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const MONTHS_RU = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const MONTHS_SHORT = ['янв','фев','мар','апр','мая','июн','июл','авг','сен','окт','ноя','дек'];
const MONTHS_GENITIVE = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
const WEEKDAYS_FULL = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];

function roundToHalfHour(timeStr) {
    if (!timeStr) return '00:00';
    let [h, m] = timeStr.split(':').map(Number);
    if (m < 30) m = '00';
    else m = '30';
    return `${pad(h)}:${m}`;
}

function addHalfHourToTime(timeStr) {
    if (!timeStr) return '00:30';
    let [h, m] = timeStr.split(':').map(Number);
    m += 30;
    if (m >= 60) {
        m -= 60;
        h = (h + 1) % 24;
    }
    return `${pad(h)}:${pad(m)}`;
}

// ==================== DOM ЭЛЕМЕНТЫ ====================
const monthTitle = document.getElementById('monthTitle');
const daysGrid = document.getElementById('daysGrid');
const weekdaysHeader = document.getElementById('weekdaysHeader');
const viewToggleBtn = document.getElementById('viewToggleBtn');

const selectedDateLarge = document.getElementById('selectedDateLarge');
const selectedMonth = document.getElementById('selectedMonth');
const agendaWeekday = document.getElementById('agendaWeekday');
const eventSummary = document.getElementById('eventSummary');
const scheduleSection = document.getElementById('scheduleSection');
const timelineWrapper = document.getElementById('timelineWrapper');

const modal = document.getElementById('modal');
const modalTitle = document.getElementById('modalTitle');
const eventForm = document.getElementById('eventForm');
const evTitle = document.getElementById('evTitle');
const evDate = document.getElementById('evDate');
const evTime = document.getElementById('evTime');
const evEndTime = document.getElementById('evEndTime');
const evDesc = document.getElementById('evDesc');

const monthPickerModal = document.getElementById('monthPickerModal');
const pickerYearLabel = document.getElementById('pickerYearLabel');
const pickerMonthsGrid = document.getElementById('pickerMonthsGrid');
const jumpToDateInput = document.getElementById('jumpToDateInput');

// ==================== ГЕНЕРАЦИЯ ЯЧЕЙКИ ====================
function generateDayCellHTML(dateObj, todayKey, selectedKey) {
    const key = formatDateKey(dateObj);
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

    return `
        <div class="${classes}" data-date="${key}">
            <span class="day-number">${dateObj.getDate()}</span>
            ${dotsHtml}
        </div>
    `;
}

// ==================== ОТРИСОВКА КАЛЕНДАРЯ ====================
function renderMonth() {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    if (isCalendarExpanded) {
        monthTitle.textContent = MONTHS_RU[month];
    } else {
        const startOfWeek = new Date(selectedDate);
        const dayOfWeek = startOfWeek.getDay();
        const diff = startOfWeek.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); 
        startOfWeek.setDate(diff);
        
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);

        const startDay = startOfWeek.getDate();
        const endDay = endOfWeek.getDate();
        const startMonth = MONTHS_SHORT[startOfWeek.getMonth()];
        const endMonth = MONTHS_SHORT[endOfWeek.getMonth()];

        if (startOfWeek.getMonth() === endOfWeek.getMonth()) {
            monthTitle.textContent = `${startDay} - ${endDay}`;
        } else {
            monthTitle.textContent = `${startDay} ${startMonth} - ${endDay} ${endMonth}`;
        }
    }

    const todayKey = formatDateKey(new Date());
    const selectedKey = formatDateKey(selectedDate);
    let daysHtml = '';

    if (isCalendarExpanded) {
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        let startOffset = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
        
        const prevMonthLastDay = new Date(year, month, 0).getDate();
        for (let i = startOffset - 1; i >= 0; i--) {
            daysHtml += `<div class="day-cell other-month"><span class="day-number">${prevMonthLastDay - i}</span></div>`;
        }
        
        for (let i = 1; i <= lastDay.getDate(); i++) {
            daysHtml += generateDayCellHTML(new Date(year, month, i), todayKey, selectedKey);
        }
        
        const totalCells = Math.ceil((startOffset + lastDay.getDate()) / 7) * 7;
        const nextDaysNeeded = totalCells - (startOffset + lastDay.getDate());
        for (let i = 1; i <= nextDaysNeeded; i++) {
            daysHtml += `<div class="day-cell other-month"><span class="day-number">${i}</span></div>`;
        }
    } else {
        const startOfWeek = new Date(selectedDate);
        const dayOfWeek = startOfWeek.getDay();
        const diff = startOfWeek.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); 
        startOfWeek.setDate(diff);

        for (let i = 0; i < 7; i++) {
            const d = new Date(startOfWeek);
            d.setDate(startOfWeek.getDate() + i);
            daysHtml += generateDayCellHTML(d, todayKey, selectedKey);
        }
    }

    daysGrid.innerHTML = daysHtml;
    
    document.querySelectorAll('.day-cell:not(.other-month)').forEach(cell => {
        cell.addEventListener('click', () => {
            const [y, m, d] = cell.dataset.date.split('-');
            selectedDate = new Date(y, m - 1, d);
            currentDate = new Date(selectedDate); 
            inlineFormTime = null;
            renderMonth(); 
            renderAgenda();
        });
    });
}

viewToggleBtn.addEventListener('click', () => {
    isCalendarExpanded = !isCalendarExpanded;
    viewToggleBtn.textContent = isCalendarExpanded ? 'Расписание' : 'Календарь';
    renderMonth();
});

// ==================== РАЗВОРАЧИВАНИЕ КАРТОЧЕК ====================
window.toggleEventExpand = (id) => {
    if (expandedEvents.has(id)) {
        expandedEvents.delete(id);
    } else {
        expandedEvents.add(id);
    }
    renderAgenda();
};

// ==================== ОТРИСОВКА РАСПИСАНИЯ ====================
function renderAgenda() {
    const key = formatDateKey(selectedDate);
    const todayKey = formatDateKey(new Date());
    
    selectedDateLarge.textContent = selectedDate.getDate();
    selectedMonth.textContent = MONTHS_GENITIVE[selectedDate.getMonth()];
    agendaWeekday.textContent = WEEKDAYS_FULL[selectedDate.getDay()];

    const dayEvents = events[key] || [];
    
    const count = dayEvents.length;
    let eventWord = 'событий';
    if (count % 10 === 1 && count % 100 !== 11) eventWord = 'событие';
    else if ([2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100)) eventWord = 'события';
    eventSummary.textContent = `${count} ${eventWord}`;

    const SLOT_HEIGHT = 80;
    const TOTAL_SLOTS = 48;
    const TOP_OFFSET = 22; // Отступ карточки от верхней границы слота (чтобы была ниже линии)

    // Рассчитываем позиции событий
    const parsedEvents = dayEvents.map(ev => {
        const [sh, sm] = ev.time.split(':').map(Number);
        const startMins = sh * 60 + sm;
        
        const endTimeStr = ev.endTime || addHalfHourToTime(ev.time);
        const [eh, em] = endTimeStr.split(':').map(Number);
        let endMins = eh * 60 + em;
        if (endMins <= startMins) endMins += 24 * 60;

        // Вычисляем отступ сверху (добавляем TOP_OFFSET, чтобы карточка была ниже пунктирной линии)
        const topPx = (startMins / 30) * SLOT_HEIGHT + TOP_OFFSET;
        
        // Высота карточки = длительность - TOP_OFFSET - 4px (отступ снизу между карточками)
        const durationMins = endMins - startMins;
        const heightPx = Math.max(20, (durationMins / 30) * SLOT_HEIGHT - TOP_OFFSET - 4);

        return { ...ev, endTimeStr, startMins, endMins, topPx, heightPx };
    });

    parsedEvents.sort((a, b) => a.startMins - b.startMins);

    // 1. Генерация сетки
    let gridHtml = `<div class="vertical-line"></div>`;
    for (let i = 0; i < TOTAL_SLOTS; i++) {
        const timeStr = `${pad(Math.floor(i/2))}:${i % 2 === 0 ? '00' : '30'}`;
        const slotStartMin = i * 30;
        const slotEndMin = slotStartMin + 30;

        const isOccupied = parsedEvents.some(ev => 
            (ev.startMins < slotEndMin && ev.endMins > slotStartMin)
        );
        const isFormOpen = (inlineFormTime === timeStr);

        gridHtml += `
            <div class="time-row" style="top: ${i * SLOT_HEIGHT}px;">
                <div class="time-label">${timeStr}</div>
                <div class="time-dot"></div>
                
                ${isOccupied && !isFormOpen ? `
                    <button class="small-add-btn" onclick="openSmallAddModal('${timeStr}')" title="Добавить событие">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                    </button>
                ` : ''}
                
                ${!isOccupied && !isFormOpen ? `
                    <div class="empty-slot-content">
                        <button class="add-slot-btn" onclick="openInlineForm('${timeStr}')">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                            Добавить событие
                        </button>
                    </div>
                ` : ''}
                
                ${isFormOpen ? `
                    <div class="inline-form-wrapper" style="top: ${TOP_OFFSET}px;">
                        <div class="inline-form">
                            <input type="text" id="inlineTitle" placeholder="Название события" autocomplete="off">
                            <textarea id="inlineDesc" placeholder="Описание (необязательно)"></textarea>
                            <div class="inline-actions">
                                <button class="btn-cancel" onclick="closeInlineForm()">Отмена</button>
                                <button class="btn-save" onclick="saveInlineEvent('${key}', '${timeStr}')">Сохранить</button>
                            </div>
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
    }

    // 2. Генерация карточек событий
    let eventsHtml = '';
    parsedEvents.forEach(ev => {
        const isExpanded = expandedEvents.has(ev.id);
        const heightStyle = isExpanded ? '' : `height: ${ev.heightPx}px;`;
        eventsHtml += `
            <div class="absolute-event-card ${isExpanded ? 'expanded' : ''}" 
                 style="top: ${ev.topPx}px; ${heightStyle}"
                 onclick="toggleEventExpand('${ev.id}')">
                <div class="event-card-header">
                    <div class="event-info">
                        <div class="event-title">${ev.title}</div>
                        <div class="event-time-range">${ev.time} - ${ev.endTimeStr}</div>
                    </div>
                    <div class="event-actions" onclick="event.stopPropagation()">
                        <button class="action-btn edit" onclick="editEvent('${key}', '${ev.id}')">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                        </button>
                        <button class="action-btn delete" onclick="deleteEvent('${key}', '${ev.id}')">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        </button>
                    </div>
                </div>
                <div class="event-card-body">
                    <div class="event-desc">${ev.desc || 'Нет описания'}</div>
                </div>
            </div>
        `;
    });

    timelineWrapper.innerHTML = `
        <div class="timeline-container" style="height: ${TOTAL_SLOTS * SLOT_HEIGHT}px;">
            <div class="timeline-grid-layer">
                ${gridHtml}
            </div>
            <div class="timeline-events-layer">
                ${eventsHtml}
            </div>
        </div>
    `;

    // Прокрутка
    setTimeout(() => {
        const stickyHeader = document.querySelector('.agenda-header');
        const headerHeight = stickyHeader ? stickyHeader.offsetHeight : 0;
        
        if (inlineFormTime) {
            const [h, m] = inlineFormTime.split(':').map(Number);
            const targetTop = ((h * 60 + m) / 30) * SLOT_HEIGHT;
            scheduleSection.scrollTop = targetTop - headerHeight - 20;
        } else if (key === todayKey) {
            const now = new Date();
            const currentMinutes = now.getHours() * 60 + now.getMinutes();
            const targetTop = (currentMinutes / 30) * SLOT_HEIGHT;
            scheduleSection.scrollTop = targetTop - headerHeight - 20;
        } else if (parsedEvents.length > 0) {
            scheduleSection.scrollTop = parsedEvents[0].topPx - headerHeight - 20;
        } else {
            scheduleSection.scrollTop = (8 * 60 / 30) * SLOT_HEIGHT - headerHeight - 20;
        }
    }, 50);
}

// ==================== ОБРАБОТКА ФОРМ ====================
window.openInlineForm = (timeStr) => {
    inlineFormTime = timeStr;
    renderAgenda();
    setTimeout(() => {
        const input = document.getElementById('inlineTitle');
        if (input) input.focus();
    }, 100);
};

window.closeInlineForm = () => {
    inlineFormTime = null;
    renderAgenda();
};

window.saveInlineEvent = (dateKey, timeStr) => {
    const titleInput = document.getElementById('inlineTitle');
    const descInput = document.getElementById('inlineDesc');
    
    const title = titleInput.value.trim();
    const desc = descInput.value.trim();
    
    if (!title) {
        alert('Пожалуйста, введите название события');
        titleInput.focus();
        return;
    }
    
    const endTime = addHalfHourToTime(timeStr);
    
    if (!events[dateKey]) events[dateKey] = [];
    events[dateKey].push({
        id: Date.now().toString(),
        time: timeStr,
        endTime: endTime,
        title: title,
        desc: desc
    });
    
    saveData(events);
    inlineFormTime = null;
    
    renderMonth(); 
    renderAgenda();
};

window.openSmallAddModal = (timeStr) => {
    editingEventInfo = null;
    modalTitle.textContent = 'Новое событие';
    
    evTitle.value = '';
    evDesc.value = '';
    evDate.value = formatDateKey(selectedDate);
    evTime.value = timeStr;
    evEndTime.value = addHalfHourToTime(timeStr);
    
    modal.classList.add('active');
    setTimeout(() => evTitle.focus(), 300);
};

document.getElementById('addBtn').addEventListener('click', () => {
    editingEventInfo = null;
    modalTitle.textContent = 'Новое событие';
    
    evTitle.value = '';
    evDesc.value = '';
    evDate.value = formatDateKey(selectedDate);
    evTime.value = '09:00';
    evEndTime.value = '09:30';
    
    modal.classList.add('active');
    setTimeout(() => evTitle.focus(), 300);
});

window.editEvent = (dateKey, id) => {
    const ev = events[dateKey].find(e => e.id === id);
    if (!ev) return;
    
    editingEventInfo = { dateKey, id };
    modalTitle.textContent = 'Редактировать событие';
    
    evTitle.value = ev.title;
    evDate.value = dateKey;
    evTime.value = ev.time;
    evEndTime.value = ev.endTime || addHalfHourToTime(ev.time); 
    evDesc.value = ev.desc || '';
    
    modal.classList.add('active');
};

function closeModal() { modal.classList.remove('active'); }

window.deleteEvent = (dateKey, id) => {
    if (!confirm('Удалить событие?')) return;
    events[dateKey] = events[dateKey].filter(ev => ev.id !== id);
    if (events[dateKey].length === 0) delete events[dateKey];
    saveData(events);
    
    renderMonth();
    renderAgenda();
};

document.getElementById('closeModalBtn').addEventListener('click', closeModal);
modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

eventForm.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const newDateKey = evDate.value;
    if (!newDateKey) return;
    
    const eventData = {
        time: evTime.value,
        endTime: evEndTime.value,
        title: evTitle.value.trim(),
        desc: evDesc.value.trim()
    };

    if (editingEventInfo) {
        events[editingEventInfo.dateKey] = events[editingEventInfo.dateKey].filter(ev => ev.id !== editingEventInfo.id);
        if (events[editingEventInfo.dateKey].length === 0) delete events[editingEventInfo.dateKey];
        
        if (!events[newDateKey]) events[newDateKey] = [];
        events[newDateKey].push({
            id: editingEventInfo.id,
            ...eventData
        });
        
        editingEventInfo = null;
    } else {
        if (!events[newDateKey]) events[newDateKey] = [];
        events[newDateKey].push({
            id: Date.now().toString(),
            ...eventData
        });
    }
    
    saveData(events);
    closeModal();
    
    selectedDate = new Date(newDateKey + 'T00:00:00'); 
    currentDate = new Date(selectedDate);
    
    renderMonth();
    renderAgenda();
});

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
    inlineFormTime = null;
    renderMonth();
    renderAgenda();
    closeMonthPicker();
});
monthPickerModal.addEventListener('click', (e) => { if (e.target === monthPickerModal) closeMonthPicker(); });

// ==================== НАВИГАЦИЯ ====================
document.getElementById('prevMonthBtn').addEventListener('click', () => {
    if (isCalendarExpanded) {
        currentDate.setMonth(currentDate.getMonth() - 1);
    } else {
        selectedDate.setDate(selectedDate.getDate() - 7);
        currentDate.setDate(currentDate.getDate() - 7);
        renderAgenda();
    }
    renderMonth();
});

document.getElementById('nextMonthBtn').addEventListener('click', () => {
    if (isCalendarExpanded) {
        currentDate.setMonth(currentDate.getMonth() + 1);
    } else {
        selectedDate.setDate(selectedDate.getDate() + 7);
        currentDate.setDate(currentDate.getDate() + 7);
        renderAgenda();
    }
    renderMonth();
});

document.getElementById('todayBtn').addEventListener('click', () => {
    const now = new Date();
    currentDate = new Date(now);
    selectedDate = new Date(now);
    inlineFormTime = null;
    renderMonth();
    renderAgenda();
});

// ==================== ИНИЦИАЛИЗАЦИЯ ====================
selectedDate = new Date();
currentDate = new Date();
renderMonth();
renderAgenda();