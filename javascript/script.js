// ==================== КОНФИГУРАЦИЯ И ШИФРОВАНИЕ ====================
const STORAGE_KEY = 'encrypted_calendar_data_v1';
// В реальном приложении этот ключ должен генерироваться на основе пароля пользователя.
// Для локального хранения без бэкенда используем статический ключ.
const SECRET_KEY = 'MySuperSecretKey_For_LocalCalendar_2024';

// Загрузка данных с расшифровкой
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

// Сохранение данных с шифрованием
function saveData(data) {
    const jsonStr = JSON.stringify(data);
    const encrypted = CryptoJS.AES.encrypt(jsonStr, SECRET_KEY).toString();
    localStorage.setItem(STORAGE_KEY, encrypted);
}

// ==================== СОСТОЯНИЕ ====================
let events = loadData(); // { "2024-02-25": [ {id, time, title, desc} ] }
let currentDate = new Date();
let selectedDate = new Date();

// ==================== УТИЛИТЫ ====================
const pad = n => String(n).padStart(2, '0');
const formatDateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const MONTHS_RU = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const MONTHS_GEN = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
const WEEKDAYS = ['Воскресенье','Понедельник','Вторник','Среда','Четверг','Пятница','Суббота'];

// Округление времени до получаса (например, 09:20 -> 09:00, 09:40 -> 09:30)
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

// ==================== ОТРИСОВКА КАЛЕНДАРЯ (МЕСЯЦ) ====================
function renderMonth() {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    monthTitle.textContent = MONTHS_RU[month];
    
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    
    // День недели 1-го числа (Пн = 0, Вс = 6)
    let startOffset = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
    
    let daysHtml = '';
    
    // Дни предыдущего месяца
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = startOffset - 1; i >= 0; i--) {
        daysHtml += `<div class="day-cell other-month">${prevMonthLastDay - i}</div>`;
    }
    
    // Дни текущего месяца
    const todayKey = formatDateKey(new Date());
    const selectedKey = formatDateKey(selectedDate);
    
    for (let i = 1; i <= lastDay.getDate(); i++) {
        const d = new Date(year, month, i);
        const key = formatDateKey(d);
        
        let classes = 'day-cell';
        if (key === todayKey) classes += ' today'; // Можно стилизовать отдельно, но в макете просто выделен выбранный
        if (key === selectedKey) classes += ' selected';
        
        const dayEvents = events[key] || [];
        if (dayEvents.length > 0) classes += ' has-events';
        
        daysHtml += `<div class="${classes}" data-date="${key}">${i}</div>`;
    }
    
    // Дни следующего месяца (добиваем до 42 ячеек для сетки)
    const totalCells = Math.ceil((startOffset + lastDay.getDate()) / 7) * 7;
    const nextDaysNeeded = totalCells - (startOffset + lastDay.getDate());
    for (let i = 1; i <= nextDaysNeeded; i++) {
        daysHtml += `<div class="day-cell other-month">${i}</div>`;
    }
    
    daysGrid.innerHTML = daysHtml;
    
    // Добавляем обработчики кликов на дни
    document.querySelectorAll('.day-cell:not(.other-month)').forEach(cell => {
        cell.addEventListener('click', () => {
            const [y, m, d] = cell.dataset.date.split('-');
            selectedDate = new Date(y, m - 1, d);
            renderMonth(); // Перерисовываем для обновления выделения
            renderAgenda();
        });
    });
}

// ==================== ОТРИСОВКА AGENDA (СПИСОК НА ВЫБРАННЫЙ ДЕНЬ) ====================
function renderAgenda() {
    selectedDateLarge.textContent = selectedDate.getDate();
    const key = formatDateKey(selectedDate);
    const dayEvents = events[key] || [];
    
    // Сортируем по времени
    dayEvents.sort((a, b) => a.time.localeCompare(b.time));
    
    eventSummary.textContent = `${dayEvents.length} events`;
    
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

// ==================== ОТРИСОВКА ДНЯ (ТАЙМЛАЙН) ====================
function renderDayView() {
    dayTitle.textContent = `${selectedDate.getDate()} ${MONTHS_GEN[selectedDate.getMonth()]}`;
    daySub.textContent = WEEKDAYS[selectedDate.getDay()];
    
    const key = formatDateKey(selectedDate);
    const dayEvents = events[key] || [];
    
    // Группируем по получасовым слотам
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
    
    // Обработчики кликов по пустым слотам
    document.querySelectorAll('.slot').forEach(slot => {
        slot.addEventListener('click', (e) => {
            // Если кликнули по самой карточке события, не открываем модалку
            if (e.target.closest('.event-card')) return;
            
            const time = slot.dataset.time;
            openModal(key, time);
        });
    });
    
    // Прокрутка к текущему времени или первому событию
    setTimeout(() => {
        const now = new Date();
        let scrollHour = 8; // по умолчанию
        if (formatDateKey(selectedDate) === formatDateKey(now)) {
            scrollHour = now.getHours();
        } else if (dayEvents.length > 0) {
            scrollHour = parseInt(dayEvents[0].time.split(':')[0]);
        }
        const targetRow = timelineWrapper.children[scrollHour];
        if (targetRow) {
            timelineWrapper.scrollTop = targetRow.offsetTop - 20;
        }
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

// ==================== МОДАЛЬНОЕ ОКНО ====================
function openModal(dateKey, time) {
    evTitle.value = '';
    evDesc.value = '';
    evDate.value = dateKey;
    evTime.value = time || '09:00';
    
    modal.classList.add('active');
    setTimeout(() => evTitle.focus(), 300);
}

function closeModal() {
    modal.classList.remove('active');
}

// Удаление события
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

// ==================== ОБРАБОТЧИКИ СОБЫТИЙ ====================
// Переключение на экран дня
document.getElementById('goToDayBtn').addEventListener('click', () => {
    monthView.classList.remove('active');
    dayView.classList.add('active');
    renderDayView();
});

// Назад к месяцу
document.getElementById('backBtn').addEventListener('click', () => {
    dayView.classList.remove('active');
    monthView.classList.add('active');
    renderMonth();
    renderAgenda();
});

// Навигация по дням на экране дня
document.getElementById('prevDayBtn').addEventListener('click', () => {
    selectedDate.setDate(selectedDate.getDate() - 1);
    renderDayView();
});

document.getElementById('nextDayBtn').addEventListener('click', () => {
    selectedDate.setDate(selectedDate.getDate() + 1);
    renderDayView();
});

// Открытие модалки по кнопке +
document.getElementById('addBtn').addEventListener('click', () => {
    const key = formatDateKey(selectedDate);
    openModal(key, '09:00');
});

// Закрытие модалки
document.getElementById('closeModalBtn').addEventListener('click', closeModal);
modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
});

// Сохранение события
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
    
    // Если мы на экране дня, обновляем таймлайн
    if (dayView.classList.contains('active')) {
        renderDayView();
    } else {
        renderMonth();
        renderAgenda();
    }
});

// ==================== ИНИЦИАЛИЗАЦИЯ ====================
// Устанавливаем сегодняшнюю дату при запуске
selectedDate = new Date();
renderMonth();
renderAgenda();