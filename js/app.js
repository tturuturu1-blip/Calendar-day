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

// ==================== УТИЛИТЫ ====================
const pad = n => String(n).padStart(2, '0');
const formatDateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const MONTHS_RU = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const MONTHS_GEN = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
const WEEKDAYS = ['Воскресенье','Понедельник','Вторник','Среда','Четверг','Пятница','Суббота'];

function roundToHalfHour(timeStr) {
    if (!timeStr) return '09:00';
    let [h, m] = timeStr.split(':').map(Number);
    if (m < 30) m = '00';
    else m = '30';
    return `${pad(h)}:${m}`;
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
const daySub = document.getElementById('daySub');
const timelineWrapper = document.getElementById('timelineWrapper');

const modal = document.getElementById('modal');
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
    
    // Дни предыдущего месяца
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = startOffset - 1; i >= 0; i--) {
        daysHtml += `<div class="day-cell other-month"><span class="day-number">${prevMonthLastDay - i}</span></div>`;
    }
    
    // Дни текущего месяца
    const todayKey = formatDateKey(new Date()); // Ключ текущего дня
    const selectedKey = formatDateKey(selectedDate);
    
    for (let i = 1; i <= lastDay.getDate(); i++) {
        const d = new Date(year, month, i);
        const key = formatDateKey(d);
        
        let classes = 'day-cell';
        
        // Добавляем класс для текущего дня
        if (key === todayKey) classes += ' today';
        // Добавляем класс для выбранного дня
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
    
    // Дни следующего месяца
    const totalCells = Math.ceil((startOffset + lastDay.getDate()) / 7) * 7;
    const nextDaysNeeded = totalCells - (startOffset + lastDay.getDate());
    for (let i = 1; i <= nextDaysNeeded; i++) {
        daysHtml += `<div class="day-cell other-month"><span class="day-number">${i}</span></div>`;
    }
    
    daysGrid.innerHTML = daysHtml;
    
    // Обработчик клика по дате
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
            <span class="time">${ev.time}</span>
            <span class="title">${ev.title}</span>
            <button class="delete-btn" onclick="deleteEvent('${key}', '${ev.id}')">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
        </div>
    `).join('');
}

// ==================== ОТРИСОВКА ДНЯ ====================
function renderDayView() {
    dayTitle.textContent = `${selectedDate.getDate()} ${MONTHS_GEN[selectedDate.getMonth()]}`;
    daySub.textContent = WEEKDAYS[selectedDate.getDay()];
    
    const key = formatDateKey(selectedDate);
    const dayEvents = events[key] || [];
    
    const slots = {};
    dayEvents.forEach(ev => {
        const roundedTime = roundToHalfHour(ev.time);
        if (!slots[roundedTime]) slots[roundedTime] = [];
        slots[roundedTime].push(ev);
    });
    
    let html = '';
    for (let h = 0; h < 24; h++) {
        html += `<div class="hour-row">
            <div class="hour-label">${pad(h)}:00</div>
            <div class="slots-container">
                <div class="slot" data-time="${pad(h)}:00">
                    ${(slots[`${pad(h)}:00`] || []).map(ev => renderTimelineEvent(ev, key)).join('')}
                </div>
                <div class="slot" data-time="${pad(h)}:30">
                    ${(slots[`${pad(h)}:30`] || []).map(ev => renderTimelineEvent(ev, key)).join('')}
                </div>
            </div>
        </div>`;
    }
    
    timelineWrapper.innerHTML = html;
    
    document.querySelectorAll('.slot').forEach(slot => {
        slot.addEventListener('click', (e) => {
            if (e.target.closest('.event-card')) return;
            openModal(key, slot.dataset.time);
        });
    });
    
    setTimeout(() => {
        const now = new Date();
        let scrollHour = 8; 
        if (formatDateKey(selectedDate) === formatDateKey(now)) {
            scrollHour = now.getHours();
        } else if (dayEvents.length > 0) {
            scrollHour = parseInt(dayEvents[0].time.split(':')[0]);
        }
        const targetRow = timelineWrapper.children[scrollHour];
        if (targetRow) timelineWrapper.scrollTop = targetRow.offsetTop - 20;
    }, 50);
}

function renderTimelineEvent(ev, dateKey) {
    return `
        <div class="event-card">
            <span class="time">${ev.time}</span>
            <span class="title">${ev.title}</span>
            <button class="delete-btn" onclick="event.stopPropagation(); deleteEvent('${dateKey}', '${ev.id}')">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
        </div>
    `;
}

// ==================== МОДАЛЬНЫЕ ОКНА ====================
function openModal(dateKey, time) {
    evTitle.value = '';
    evDesc.value = '';
    evDate.value = dateKey;
    evTime.value = time || '09:00';
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

document.getElementById('prevDayBtn').addEventListener('click', () => {
    selectedDate.setDate(selectedDate.getDate() - 1);
    currentDate = new Date(selectedDate);
    renderDayView();
});
document.getElementById('nextDayBtn').addEventListener('click', () => {
    selectedDate.setDate(selectedDate.getDate() + 1);
    currentDate = new Date(selectedDate);
    renderDayView();
});

document.getElementById('closeModalBtn').addEventListener('click', closeModal);
modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
monthPickerModal.addEventListener('click', (e) => { if (e.target === monthPickerModal) closeMonthPicker(); });

eventForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const key = evDate.value;
    if (!key) return;
    
    if (!events[key]) events[key] = [];
    events[key].push({
        id: Date.now().toString(),
        time: evTime.value,
        title: evTitle.value.trim(),
        desc: evDesc.value.trim()
    });
    
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