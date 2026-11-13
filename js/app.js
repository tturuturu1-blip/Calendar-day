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
let currentDate = new Date();   // Отображаемый месяц
let selectedDate = new Date();  // Выбранный день для расписания
let pickerDate = new Date();
let editingEventInfo = null;

// ==================== УТИЛИТЫ ====================
const pad = n => String(n).padStart(2, '0');
const formatDateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const MONTHS_RU = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const WEEKDAYS_SHORT = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

// Округление времени вниз до получаса (например, 09:47 -> 09:30)
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
const selectedDateLarge = document.getElementById('selectedDateLarge');
const agendaDateLabel = document.getElementById('agendaDateLabel');
const eventSummary = document.getElementById('eventSummary');
const timelineWrapper = document.getElementById('timelineWrapper');

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
    
    // Предыдущий месяц
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = startOffset - 1; i >= 0; i--) {
        daysHtml += `<div class="day-cell other-month"><span class="day-number">${prevMonthLastDay - i}</span></div>`;
    }
    
    // Текущий месяц
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
    
    // Следующий месяц
    const totalCells = Math.ceil((startOffset + lastDay.getDate()) / 7) * 7;
    const nextDaysNeeded = totalCells - (startOffset + lastDay.getDate());
    for (let i = 1; i <= nextDaysNeeded; i++) {
        daysHtml += `<div class="day-cell other-month"><span class="day-number">${i}</span></div>`;
    }
    
    daysGrid.innerHTML = daysHtml;
    
    // Обработчик клика по дате (обновляет только расписание)
    document.querySelectorAll('.day-cell:not(.other-month)').forEach(cell => {
        cell.addEventListener('click', () => {
            const [y, m, d] = cell.dataset.date.split('-');
            selectedDate = new Date(y, m - 1, d);
            
            renderMonth(); 
            renderAgenda();
        });
    });
}

// ==================== ОТРИСОВКА РАСПИСАНИЯ (ТАЙМЛАЙН) ====================
function renderAgenda() {
    const key = formatDateKey(selectedDate);
    const todayKey = formatDateKey(new Date());
    
    // Обновляем шапку блока
    selectedDateLarge.textContent = selectedDate.getDate();
    if (key === todayKey) {
        agendaDateLabel.textContent = 'СЕГОДНЯ';
    } else {
        agendaDateLabel.textContent = WEEKDAYS_SHORT[selectedDate.getDay()];
    }

    const dayEvents = events[key] || [];
    dayEvents.sort((a, b) => a.time.localeCompare(b.time));
    
    // Склонение
    const count = dayEvents.length;
    let eventWord = 'событий';
    if (count % 10 === 1 && count % 100 !== 11) eventWord = 'событие';
    else if ([2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100)) eventWord = 'события';
    eventSummary.textContent = `${count} ${eventWord}`;

    // Вертикальный таймлайн (каждые полчаса)
    let timelineHtml = '';
    
    // Группируем события по получасовым слотам
    const eventsBySlot = {};
    dayEvents.forEach(ev => {
        const slotTime = roundToHalfHour(ev.time);
        if (!eventsBySlot[slotTime]) eventsBySlot[slotTime] = [];
        eventsBySlot[slotTime].push(ev);
    });

    // Генерируем 48 слотов (24 часа * 2)
    for (let h = 0; h < 24; h++) {
        for (let m of ['00', '30']) {
            const timeStr = `${pad(h)}:${m}`;
            const slotEvents = eventsBySlot[timeStr] || [];
            
            timelineHtml += `
                <div class="hour-slot">
                    <div class="time-label">${timeStr}</div>
                    <div class="slot-content">
                        ${slotEvents.map(ev => renderTimelineCard(ev, key)).join('')}
                        <button class="add-slot-btn" onclick="openModal('${key}', '${timeStr}')">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                            Добавить событие
                        </button>
                    </div>
                </div>
            `;
        }
    }

    timelineWrapper.innerHTML = timelineHtml;

    // Прокрутка к текущему времени (если сегодня) или к 08:00
    setTimeout(() => {
        const now = new Date();
        let scrollHour = 8;
        if (key === todayKey) scrollHour = now.getHours();
        
        const targetSlot = timelineWrapper.children[scrollHour * 2];
        if (targetSlot) {
            timelineWrapper.scrollTop = targetSlot.offsetTop - 10;
        }
    }, 50);
}

// Шаблон карточки события
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
    
    renderMonth();
    renderAgenda();
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
    
    // Синхронизируем дату
    selectedDate = new Date(newDateKey + 'T00:00:00'); 
    currentDate = new Date(selectedDate);
    
    renderMonth();
    renderAgenda();
});

// ==================== ИНИЦИАЛИЗАЦИЯ ====================
selectedDate = new Date();
currentDate = new Date();
renderMonth();
renderAgenda();