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

// Состояния для UI
let isCalendarExpanded = true;
let inlineFormTime = null; // Время слота, в котором открыта форма

// ==================== УТИЛИТЫ ====================
const pad = n => String(n).padStart(2, '0');
const formatDateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const MONTHS_RU = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const WEEKDAYS_SHORT = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const WEEKDAYS_FULL = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];

function roundToHalfHour(timeStr) {
    if (!timeStr) return '00:00';
    let [h, m] = timeStr.split(':').map(Number);
    if (m < 30) m = '00';
    else m = '30';
    return `${pad(h)}:${m}`;
}

function addHourToTime(timeStr) {
    if (!timeStr) return '01:00';
    let [h, m] = timeStr.split(':').map(Number);
    h = (h + 1) % 24;
    return `${pad(h)}:${pad(m)}`;
}

// ==================== DOM ЭЛЕМЕНТЫ ====================
const monthTitle = document.getElementById('monthTitle');
const daysGrid = document.getElementById('daysGrid');
const weekdaysHeader = document.getElementById('weekdaysHeader');
const weekStrip = document.getElementById('weekStrip');
const viewToggleBtn = document.getElementById('viewToggleBtn');

const selectedDateLarge = document.getElementById('selectedDateLarge');
const agendaWeekday = document.getElementById('agendaWeekday');
const eventSummary = document.getElementById('eventSummary');
const timelineWrapper = document.getElementById('timelineWrapper');

// Элементы модалки (для редактирования)
const modal = document.getElementById('modal');
const modalTitle = document.getElementById('modalTitle');
const eventForm = document.getElementById('eventForm');
const evTitle = document.getElementById('evTitle');
const evDate = document.getElementById('evDate');
const evTime = document.getElementById('evTime');
const evDesc = document.getElementById('evDesc');

// Элементы выбора месяца
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
            inlineFormTime = null; // Закрываем форму при смене даты
            renderMonth(); 
            renderAgenda();
        });
    });
}

// Отрисовка ленты недели (свернутый календарь)
function renderWeekStrip() {
    let html = '';
    const startOfWeek = new Date(selectedDate);
    const dayOfWeek = startOfWeek.getDay();
    const diff = startOfWeek.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); 
    startOfWeek.setDate(diff);

    for (let i = 0; i < 7; i++) {
        const d = new Date(startOfWeek);
        d.setDate(startOfWeek.getDate() + i);
        const dKey = formatDateKey(d);
        const isSelected = dKey === formatDateKey(selectedDate);
        
        html += `
            <div class="date-pill ${isSelected ? 'active' : ''}" onclick="selectDateFromStrip('${dKey}')">
                <span class="pill-day">${d.getDate()}</span>
                <span class="pill-weekday">${WEEKDAYS_SHORT[d.getDay()]}</span>
            </div>
        `;
    }
    weekStrip.innerHTML = html;
}

window.selectDateFromStrip = (key) => {
    const [y, m, d] = key.split('-');
    selectedDate = new Date(y, m - 1, d);
    currentDate = new Date(selectedDate);
    inlineFormTime = null;
    renderMonth();
    renderAgenda();
    renderWeekStrip();
};

// Переключение вида календаря
viewToggleBtn.addEventListener('click', () => {
    isCalendarExpanded = !isCalendarExpanded;
    
    if (isCalendarExpanded) {
        weekdaysHeader.classList.remove('hidden');
        daysGrid.classList.remove('hidden');
        weekStrip.classList.add('hidden');
        viewToggleBtn.textContent = 'Расписание';
    } else {
        weekdaysHeader.classList.add('hidden');
        daysGrid.classList.add('hidden');
        weekStrip.classList.remove('hidden');
        viewToggleBtn.textContent = 'Календарь';
        renderWeekStrip();
    }
});

// ==================== ОТРИСОВКА РАСПИСАНИЯ ====================
function renderAgenda() {
    const key = formatDateKey(selectedDate);
    const todayKey = formatDateKey(new Date());
    
    selectedDateLarge.textContent = selectedDate.getDate();
    agendaWeekday.textContent = WEEKDAYS_FULL[selectedDate.getDay()];

    const dayEvents = events[key] || [];
    dayEvents.sort((a, b) => a.time.localeCompare(b.time));
    
    const count = dayEvents.length;
    let eventWord = 'событий';
    if (count % 10 === 1 && count % 100 !== 11) eventWord = 'событие';
    else if ([2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100)) eventWord = 'события';
    eventSummary.textContent = `${count} ${eventWord}`;

    let timelineHtml = '';
    
    const eventsBySlot = {};
    dayEvents.forEach(ev => {
        const slotTime = roundToHalfHour(ev.time);
        if (!eventsBySlot[slotTime]) eventsBySlot[slotTime] = [];
        eventsBySlot[slotTime].push(ev);
    });

    for (let h = 0; h < 24; h++) {
        for (let m of ['00', '30']) {
            const timeStr = `${pad(h)}:${m}`;
            const slotEvents = eventsBySlot[timeStr] || [];
            
            let slotContentHtml = slotEvents.map(ev => renderTimelineCard(ev, key)).join('');

            // Если в этом слоте открыта форма добавления
            if (inlineFormTime === timeStr) {
                slotContentHtml += `
                    <div class="inline-form">
                        <input type="text" id="inlineTitle" placeholder="Название события" autocomplete="off">
                        <textarea id="inlineDesc" placeholder="Описание (необязательно)"></textarea>
                        <div class="inline-actions">
                            <button class="btn-cancel" onclick="closeInlineForm()">Отмена</button>
                            <button class="btn-save" onclick="saveInlineEvent('${key}', '${timeStr}')">Сохранить</button>
                        </div>
                    </div>
                `;
            } else {
                slotContentHtml += `
                    <button class="add-slot-btn" onclick="openInlineForm('${timeStr}')">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                        Добавить событие
                    </button>
                `;
            }
            
            timelineHtml += `
                <div class="hour-slot">
                    <div class="time-label">${timeStr}</div>
                    <div class="slot-content">
                        ${slotContentHtml}
                    </div>
                </div>
            `;
        }
    }

    timelineWrapper.innerHTML = timelineHtml;

    // Прокрутка к текущему времени или форме
    setTimeout(() => {
        const now = new Date();
        let scrollHour = 8;
        if (key === todayKey && inlineFormTime === null) {
            scrollHour = now.getHours();
        } else if (inlineFormTime) {
            scrollHour = parseInt(inlineFormTime.split(':')[0]);
        }
        
        const targetSlot = timelineWrapper.children[scrollHour * 2];
        if (targetSlot) {
            timelineWrapper.scrollTop = targetSlot.offsetTop - 10;
        }
    }, 50);
}

function renderTimelineCard(ev, dateKey) {
    const endTime = addHourToTime(ev.time);
    return `
        <div class="timeline-card">
            <div class="event-actions">
                <button class="action-btn edit" onclick="editEvent('${dateKey}', '${ev.id}')">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                </button>
                <button class="action-btn delete" onclick="deleteEvent('${dateKey}', '${ev.id}')">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
            </div>
            <div class="event-title">${ev.title}</div>
            <div class="event-time-range">${ev.time} - ${endTime}</div>
            ${ev.desc ? `<div class="event-desc">${ev.desc}</div>` : ''}
        </div>
    `;
}

// ==================== ВСТРОЕННАЯ ФОРМА (INLINE) ====================
window.openInlineForm = (timeStr) => {
    inlineFormTime = timeStr;
    renderAgenda();
    // Автофокус на поле ввода
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
    
    if (!events[dateKey]) events[dateKey] = [];
    events[dateKey].push({
        id: Date.now().toString(),
        time: timeStr,
        title: title,
        desc: desc
    });
    
    saveData(events);
    inlineFormTime = null;
    
    renderMonth(); // Обновляем точки на календаре
    if (!isCalendarExpanded) renderWeekStrip();
    renderAgenda(); // Перерисовываем таймлайн
};

// Кнопка "+" в шапке теперь открывает инлайн-форму на 09:00
document.getElementById('addBtn').addEventListener('click', () => {
    inlineFormTime = '09:00';
    renderAgenda();
    setTimeout(() => {
        const input = document.getElementById('inlineTitle');
        if (input) input.focus();
    }, 100);
});

// ==================== МОДАЛЬНЫЕ ОКНА (РЕДАКТИРОВАНИЕ) ====================
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
};

function closeModal() { modal.classList.remove('active'); }

window.deleteEvent = (dateKey, id) => {
    if (!confirm('Удалить событие?')) return;
    events[dateKey] = events[dateKey].filter(ev => ev.id !== id);
    if (events[dateKey].length === 0) delete events[dateKey];
    saveData(events);
    
    renderMonth();
    if (!isCalendarExpanded) renderWeekStrip();
    renderAgenda();
};

document.getElementById('closeModalBtn').addEventListener('click', closeModal);
modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

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
    }
    
    saveData(events);
    closeModal();
    
    selectedDate = new Date(newDateKey + 'T00:00:00'); 
    currentDate = new Date(selectedDate);
    
    renderMonth();
    if (!isCalendarExpanded) renderWeekStrip();
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
    if (!isCalendarExpanded) renderWeekStrip();
    renderAgenda();
    closeMonthPicker();
});
monthPickerModal.addEventListener('click', (e) => { if (e.target === monthPickerModal) closeMonthPicker(); });

// ==================== НАВИГАЦИЯ ====================
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
    inlineFormTime = null;
    renderMonth();
    if (!isCalendarExpanded) renderWeekStrip();
    renderAgenda();
});

// ==================== ИНИЦИАЛИЗАЦИЯ ====================
selectedDate = new Date();
currentDate = new Date();
renderMonth();
renderAgenda();