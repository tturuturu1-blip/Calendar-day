document.addEventListener('DOMContentLoaded', () => {
    
    // ==========================================
    // 1. НАВИГАЦИЯ (SPA Роутинг)
    // ==========================================
    const navLinks = document.querySelectorAll('[data-page]');
    const pages = document.querySelectorAll('.page');
    const navBtns = document.querySelectorAll('.sidebar-nav > .nav-btn');

    function navigateTo(pageId) {
        // Скрываем все страницы
        pages.forEach(p => p.classList.remove('active'));
        
        // Показываем нужную
        const target = document.getElementById(`page-${pageId}`);
        if (target) target.classList.add('active');

        // Обновляем активные классы в меню
        navBtns.forEach(btn => btn.classList.remove('active'));
        const activeBtn = document.querySelector(`.sidebar-nav > [data-page="${pageId}"]`);
        if (activeBtn) activeBtn.classList.add('active');

        // Меняем URL hash без перезагрузки
        history.pushState(null, null, `#${pageId}`);
    }

    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const pageId = link.getAttribute('data-page');
            navigateTo(pageId);
        });
    });

    // Проверяем хэш при загрузке
    if (window.location.hash) {
        const initialPage = window.location.hash.replace('#', '');
        navigateTo(initialPage);
    }

    // ==========================================
    // 2. ЗАШИФРОВАННОЕ ЛОКАЛЬНОЕ ХРАНИЛИЩЕ (AES-GCM)
    // ==========================================
    
    // Функция для генерации ключа шифрования (в реальном приложении ключ должен быть статичным или производным от пароля пользователя)
    async function getCryptoKey() {
        // В демонстрационных целях используем фиксированный набор байтов для ключа.
        // В продакшене: используйте IndexedDB для хранения сгенерированного ключа или просите пароль.
        const enc = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey(
            "raw",
            enc.encode("SuperSecretGymnasticsKey2026"), // Соль/пароль
            { name: "PBKDF2" },
            false,
            ["deriveKey"]
        );
        
        return crypto.subtle.deriveKey(
            {
                name: "PBKDF2",
                salt: enc.encode("salt123"),
                iterations: 100000,
                hash: "SHA-256"
            },
            keyMaterial,
            { name: "AES-GCM", length: 256 },
            false,
            ["encrypt", "decrypt"]
        );
    }

    // Функция шифрования данных
    async function encryptData(data) {
        const key = await getCryptoKey();
        const iv = crypto.getRandomValues(new Uint8Array(12)); // Вектор инициализации
        const encodedData = new TextEncoder().encode(data);
        
        const ciphertext = await crypto.subtle.encrypt(
            { name: "AES-GCM", iv: iv },
            key,
            encodedData
        );
        
        // Возвращаем IV и зашифрованный текст, объединенные в строку (Base64)
        const ivBase64 = btoa(String.fromCharCode(...iv));
        const cipherBase64 = btoa(String.fromCharCode(...new Uint8Array(ciphertext)));
        return `${ivBase64}:${cipherBase64}`;
    }

    // Функция расшифровки данных
    async function decryptData(encryptedString) {
        try {
            const key = await getCryptoKey();
            const [ivBase64, cipherBase64] = encryptedString.split(':');
            
            const iv = new Uint8Array(atob(ivBase64).split('').map(c => c.charCodeAt(0)));
            const ciphertext = new Uint8Array(atob(cipherBase64).split('').map(c => c.charCodeAt(0)));
            
            const decrypted = await crypto.subtle.decrypt(
                { name: "AES-GCM", iv: iv },
                key,
                ciphertext
            );
            
            return new TextDecoder().decode(decrypted);
        } catch (e) {
            console.error("Ошибка расшифровки данных (возможно, поврежден ключ или данные):", e);
            return null;
        }
    }

    // ==========================================
    // 3. ЛОГИКА РАБОТЫ С ЗАМЕТКАМИ
    // ==========================================
    const noteInput = document.getElementById('note-input');
    const addNoteBtn = document.getElementById('add-note-btn');
    const notesList = document.getElementById('notes-list');
    
    // Загружаем заметки из LocalStorage
    async function loadNotes() {
        const encryptedNotes = localStorage.getItem('gym_notes_enc');
        if (!encryptedNotes) return;

        const decryptedJSON = await decryptData(encryptedNotes);
        if (!decryptedJSON) return;

        try {
            const notes = JSON.parse(decryptedJSON);
            notesList.innerHTML = '';
            notes.forEach(note => {
                renderNote(note.text, note.id);
            });
        } catch (e) {
            console.error("Ошибка парсинга заметок", e);
        }
    }

    // Сохраняем заметки в LocalStorage (с шифрованием)
    async function saveNotesToStorage() {
        const items = notesList.querySelectorAll('li');
        const notesArray = [];
        
        items.forEach(item => {
            notesArray.push({
                id: item.dataset.id,
                text: item.querySelector('span').textContent
            });
        });

        const jsonString = JSON.stringify(notesArray);
        const encrypted = await encryptData(jsonString);
        localStorage.setItem('gym_notes_enc', encrypted);
    }

    // Отрисовка одной заметки в DOM
    function renderNote(text, id) {
        const li = document.createElement('li');
        li.dataset.id = id;
        
        const span = document.createElement('span');
        span.textContent = text;
        
        const delBtn = document.createElement('button');
        delBtn.className = 'delete-btn';
        delBtn.innerHTML = '×';
        delBtn.title = 'Удалить заметку';
        
        delBtn.addEventListener('click', () => {
            li.remove();
            saveNotesToStorage();
        });

        li.appendChild(span);
        li.appendChild(delBtn);
        notesList.appendChild(li);
    }

    // Добавление новой заметки
    addNoteBtn.addEventListener('click', () => {
        const text = noteInput.value.trim();
        if (text) {
            const id = Date.now().toString(); // Простой уникальный ID
            renderNote(text, id);
            noteInput.value = '';
            saveNotesToStorage();
        }
    });

    // Добавление по нажатию Enter
    noteInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            addNoteBtn.click();
        }
    });

    // Инициализация загрузки заметок при старте
    loadNotes();
});