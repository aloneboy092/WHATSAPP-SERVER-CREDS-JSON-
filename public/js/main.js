
let currentUser = null;
let ws = null;
let sessions = [];
let tasks = [];
let groups = [];

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    checkAuthStatus();
    initializeWebSocket();
    setupEventListeners();
});

function checkAuthStatus() {
    const token = localStorage.getItem('token');
    if (token) {
        showDashboard();
    } else {
        showAuth();
    }
}

function showAuth() {
    document.getElementById('auth-view').classList.remove('hidden');
    document.getElementById('dashboard-view').classList.add('hidden');
}

function showDashboard() {
    document.getElementById('auth-view').classList.add('hidden');
    document.getElementById('dashboard-view').classList.remove('hidden');
    loadSessions();
    loadTasks();
}

function initializeWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${window.location.host}`);
    
    ws.onopen = function() {
        console.log('WebSocket connected');
        if (currentUser) {
            ws.send(JSON.stringify({
                type: 'auth',
                userId: currentUser.id
            }));
        }
    };
    
    ws.onmessage = function(event) {
        const data = JSON.parse(event.data);
        handleWebSocketMessage(data);
    };
    
    ws.onclose = function() {
        console.log('WebSocket disconnected');
        setTimeout(initializeWebSocket, 3000);
    };
}

function handleWebSocketMessage(data) {
    switch (data.type) {
        case 'log':
            // Only show logs if they're for this user or if no userId is specified (general logs)
            if (!data.userId || (currentUser && data.userId === currentUser.id)) {
                addLogEntry(data.message, data.level);
            }
            break;
        case 'status_update':
            if (data.sessionId) {
                updateSessionStatus(data.sessionId, data.status);
            }
            if (data.taskId) {
                updateTaskStatus(data.taskId, data.status);
            }
            break;
    }
}

function addLogEntry(message, level = 'info') {
    const logsDisplay = document.getElementById('logs-display');
    const logLine = document.createElement('div');
    logLine.className = `log-line log-${level}`;
    logLine.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    logsDisplay.appendChild(logLine);
    logsDisplay.scrollTop = logsDisplay.scrollHeight;
}

function updateSessionStatus(sessionId, status) {
    const sessionCard = document.querySelector(`[data-session-id="${sessionId}"]`);
    if (sessionCard) {
        const statusDot = sessionCard.querySelector('.status-dot');
        const statusText = sessionCard.querySelector('.status-text');
        
        statusDot.className = `status-dot status-${status}`;
        statusText.textContent = status.charAt(0).toUpperCase() + status.slice(1);
    }
}

function updateTaskStatus(taskId, status) {
    const taskCard = document.querySelector(`[data-task-id="${taskId}"]`);
    if (taskCard) {
        const statusDot = taskCard.querySelector('.status-dot');
        const statusText = taskCard.querySelector('.status-text');
        
        statusDot.className = `status-dot status-${status}`;
        statusText.textContent = status.charAt(0).toUpperCase() + status.slice(1);
    }
}

function setupEventListeners() {
    // Auth form toggles
    document.getElementById('show-register').addEventListener('click', function(e) {
        e.preventDefault();
        document.getElementById('login-form').classList.add('hidden');
        document.getElementById('register-form').classList.remove('hidden');
    });

    document.getElementById('show-login').addEventListener('click', function(e) {
        e.preventDefault();
        document.getElementById('register-form').classList.add('hidden');
        document.getElementById('login-form').classList.remove('hidden');
    });

    // Login form
    document.getElementById('login-form-submit').addEventListener('submit', async function(e) {
        e.preventDefault();
        const username = document.getElementById('login-username').value;
        const password = document.getElementById('login-password').value;

        try {
            const response = await fetch('/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();
            if (response.ok) {
                localStorage.setItem('token', 'logged-in');
                currentUser = data.user;
                showDashboard();
            } else {
                throw new Error(data.message);
            }
        } catch (error) {
            Swal.fire({
                icon: 'error',
                title: 'Login Failed',
                text: error.message
            });
        }
    });

    // Register form
    document.getElementById('register-form-submit').addEventListener('submit', async function(e) {
        e.preventDefault();
        const username = document.getElementById('register-username').value;
        const password = document.getElementById('register-password').value;

        try {
            const response = await fetch('/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();
            if (response.ok) {
                Swal.fire({
                    icon: 'success',
                    title: 'Registration Successful',
                    text: 'You can now log in with your credentials.'
                });
                document.getElementById('register-form').classList.add('hidden');
                document.getElementById('login-form').classList.remove('hidden');
            } else {
                throw new Error(data.message);
            }
        } catch (error) {
            Swal.fire({
                icon: 'error',
                title: 'Registration Failed',
                text: error.message
            });
        }
    });

    // Logout
    document.getElementById('logout-btn').addEventListener('click', function() {
        localStorage.removeItem('token');
        currentUser = null;
        showAuth();
    });

    // Navigation
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const tab = this.getAttribute('data-tab');
            switchTab(tab);
        });
    });

    // Modals
    document.getElementById('add-session-btn').addEventListener('click', function() {
        document.getElementById('add-session-modal').classList.remove('hidden');
    });

    document.getElementById('add-task-btn').addEventListener('click', function() {
        document.getElementById('task-modal-title').textContent = 'Add New Task';
        document.getElementById('task-submit-text').textContent = 'Create Task';
        document.getElementById('edit-task-id').value = '';
        document.getElementById('add-task-form').reset();
        loadSessionsForTask();
        document.getElementById('add-task-modal').classList.remove('hidden');
    });

    document.getElementById('fetch-groups-btn').addEventListener('click', function() {
        fetchGroups();
    });

    // Close modals
    document.querySelectorAll('.close-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            this.closest('.fixed').classList.add('hidden');
        });
    });

    // Forms
    document.getElementById('add-session-form').addEventListener('submit', handleAddSession);
    document.getElementById('add-task-form').addEventListener('submit', handleAddTask);
}

function switchTab(tab) {
    // Update navigation
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active', 'text-blue-600');
        btn.classList.add('text-gray-500');
    });
    document.querySelector(`[data-tab="${tab}"]`).classList.add('active', 'text-blue-600');
    document.querySelector(`[data-tab="${tab}"]`).classList.remove('text-gray-500');

    // Update content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.add('hidden');
    });
    document.getElementById(`${tab}-content`).classList.remove('hidden');

    // Load data if needed
    if (tab === 'groups') {
        loadSessionsForGroups();
    }
}

async function loadSessions() {
    try {
        const response = await fetch('/api/sessions');
        sessions = await response.json();
        updateSessionsCount();
        renderSessions();
    } catch (error) {
        console.error('Failed to load sessions:', error);
    }
}

async function loadTasks() {
    try {
        const response = await fetch('/api/tasks');
        tasks = await response.json();
        updateTasksCount();
        renderTasks();
    } catch (error) {
        console.error('Failed to load tasks:', error);
    }
}

function updateSessionsCount() {
    document.getElementById('sessions-count').textContent = sessions.length;
}

function updateTasksCount() {
    document.getElementById('tasks-count').textContent = tasks.length;
}

function renderSessions() {
    const container = document.getElementById('sessions-list');
    container.innerHTML = '';

    sessions.forEach(session => {
        const sessionCard = document.createElement('div');
        sessionCard.className = 'bg-white rounded-lg shadow p-4 card-hover transition-transform duration-200';
        sessionCard.setAttribute('data-session-id', session.id);
        sessionCard.innerHTML = `
            <div class="flex items-center justify-between">
                <div class="flex items-center">
                    <div class="status-dot status-${session.status}"></div>
                    <div>
                        <h3 class="font-semibold text-gray-900">${session.name}</h3>
                        <p class="text-sm text-gray-600 status-text">${session.status.charAt(0).toUpperCase() + session.status.slice(1)}</p>
                    </div>
                </div>
                <div class="flex space-x-2">
                    <button class="text-blue-600 hover:text-blue-800" onclick="startSession(${session.id})">
                        <i class="fas fa-play"></i>
                    </button>
                    <button class="text-red-600 hover:text-red-800" onclick="deleteSession(${session.id})">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
            ${session.last_log ? `<p class="text-xs text-gray-500 mt-2">${session.last_log}</p>` : ''}
        `;
        container.appendChild(sessionCard);
    });
}

function renderTasks() {
    const container = document.getElementById('tasks-list');
    container.innerHTML = '';

    tasks.forEach(task => {
        const taskCard = document.createElement('div');
        taskCard.className = 'bg-white rounded-lg shadow p-4 card-hover transition-transform duration-200';
        taskCard.setAttribute('data-task-id', task.id);
        
        const sessionName = sessions.find(s => s.id === task.session_id)?.name || 'Unknown';
        const targetType = task.target_type || 'contact';
        const targetDisplay = targetType === 'group' ? 'Group' : 'Contact';
        
        taskCard.innerHTML = `
            <div class="flex items-center justify-between">
                <div class="flex items-center">
                    <div class="status-dot status-${task.status}"></div>
                    <div>
                        <h3 class="font-semibold text-gray-900">${task.name}</h3>
                        <p class="text-sm text-gray-600 status-text">${task.status.charAt(0).toUpperCase() + task.status.slice(1)}</p>
                        <p class="text-xs text-gray-500">Session: ${sessionName} | Target: ${targetDisplay}</p>
                    </div>
                </div>
                <div class="flex space-x-2">
                    ${task.status === 'running' ? 
                        `<button class="text-red-600 hover:text-red-800" onclick="stopTask(${task.id})">
                            <i class="fas fa-stop"></i>
                        </button>` : 
                        `<button class="text-green-600 hover:text-green-800" onclick="startTask(${task.id})">
                            <i class="fas fa-play"></i>
                        </button>`
                    }
                    <button class="text-blue-600 hover:text-blue-800" onclick="editTask(${task.id})">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="text-red-600 hover:text-red-800" onclick="deleteTask(${task.id})">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
            ${task.last_log ? `<p class="text-xs text-gray-500 mt-2">${task.last_log}</p>` : ''}
        `;
        container.appendChild(taskCard);
    });
}

function loadSessionsForTask() {
    const select = document.getElementById('task-session-select');
    select.innerHTML = '<option value="">-- Select a Session --</option>';
    
    sessions.forEach(session => {
        const option = document.createElement('option');
        option.value = session.id;
        option.textContent = session.name;
        select.appendChild(option);
    });
}

function loadSessionsForGroups() {
    const select = document.getElementById('groups-session-select');
    select.innerHTML = '<option value="">-- Select a Session --</option>';
    
    sessions.forEach(session => {
        const option = document.createElement('option');
        option.value = session.id;
        option.textContent = session.name;
        select.appendChild(option);
    });
}

async function handleAddSession(e) {
    e.preventDefault();
    
    const formData = new FormData();
    formData.append('name', document.getElementById('new-session-name').value);
    formData.append('credsFile', document.getElementById('creds-file-input').files[0]);
    
    try {
        const response = await fetch('/api/sessions', {
            method: 'POST',
            body: formData
        });
        
        if (response.ok) {
            document.getElementById('add-session-modal').classList.add('hidden');
            loadSessions();
            
            Swal.fire({
                icon: 'success',
                title: 'Session Added!',
                text: 'Your WhatsApp session has been created successfully.',
                timer: 2000,
                showConfirmButton: false
            });
            
            document.getElementById('add-session-form').reset();
        } else {
            const errorData = await response.json();
            throw new Error(errorData.message);
        }
    } catch (error) {
        console.error('Failed to add session:', error);
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: error.message || 'Failed to add session',
            confirmButtonColor: '#3085d6'
        });
    }
}

async function handleAddTask(e) {
    e.preventDefault();
    
    const name = document.getElementById('new-task-name').value;
    const sessionId = document.getElementById('task-session-select').value;
    const target = document.getElementById('task-target').value;
    const targetType = document.getElementById('task-target-type').value;
    const messagesText = document.getElementById('task-messages').value;
    const interval = document.getElementById('task-interval').value;
    const prefixName = document.getElementById('task-prefix').value;
    const editTaskId = document.getElementById('edit-task-id').value;
    
    const messages = messagesText.split('\n').filter(msg => msg.trim());
    
    const taskData = {
        name,
        sessionId: parseInt(sessionId),
        target,
        targetType,
        messages,
        interval: parseInt(interval),
        prefixName
    };
    
    try {
        const url = editTaskId ? `/api/tasks/${editTaskId}` : '/api/tasks';
        const method = editTaskId ? 'PUT' : 'POST';
        
        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(taskData)
        });
        
        if (response.ok) {
            document.getElementById('add-task-modal').classList.add('hidden');
            loadTasks();
            
            Swal.fire({
                icon: 'success',
                title: editTaskId ? 'Task Updated!' : 'Task Created!',
                text: editTaskId ? 'Your task has been updated successfully.' : 'Your task has been created successfully.',
                timer: 2000,
                showConfirmButton: false
            });
            
            document.getElementById('add-task-form').reset();
        } else {
            const errorData = await response.json();
            throw new Error(errorData.message);
        }
    } catch (error) {
        console.error('Failed to save task:', error);
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: error.message || 'Failed to save task',
            confirmButtonColor: '#3085d6'
        });
    }
}

async function startTask(taskId) {
    try {
        const response = await fetch(`/api/tasks/${taskId}/start`, {
            method: 'POST'
        });
        
        if (response.ok) {
            loadTasks();
            Swal.fire({
                icon: 'success',
                title: 'Task Started!',
                text: 'Your task has been started.',
                timer: 2000,
                showConfirmButton: false
            });
        } else {
            const errorData = await response.json();
            throw new Error(errorData.message);
        }
    } catch (error) {
        console.error('Failed to start task:', error);
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: error.message || 'Failed to start task',
            confirmButtonColor: '#3085d6'
        });
    }
}

async function stopTask(taskId) {
    try {
        const response = await fetch(`/api/tasks/${taskId}/stop`, {
            method: 'POST'
        });
        
        if (response.ok) {
            loadTasks();
            Swal.fire({
                icon: 'success',
                title: 'Task Stopped!',
                text: 'Your task has been stopped.',
                timer: 2000,
                showConfirmButton: false
            });
        } else {
            const errorData = await response.json();
            throw new Error(errorData.message);
        }
    } catch (error) {
        console.error('Failed to stop task:', error);
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: error.message || 'Failed to stop task',
            confirmButtonColor: '#3085d6'
        });
    }
}

function editTask(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    
    document.getElementById('task-modal-title').textContent = 'Edit Task';
    document.getElementById('task-submit-text').textContent = 'Update Task';
    document.getElementById('edit-task-id').value = taskId;
    
    document.getElementById('new-task-name').value = task.name;
    document.getElementById('task-session-select').value = task.session_id;
    document.getElementById('task-target').value = task.target || '';
    document.getElementById('task-target-type').value = task.target_type || 'contact';
    document.getElementById('task-interval').value = task.interval;
    document.getElementById('task-prefix').value = task.prefix_name || '';
    
    try {
        const messages = JSON.parse(task.messages || '[]');
        document.getElementById('task-messages').value = messages.join('\n');
    } catch (e) {
        document.getElementById('task-messages').value = '';
    }
    
    loadSessionsForTask();
    document.getElementById('add-task-modal').classList.remove('hidden');
}

async function fetchGroups() {
    const sessionId = document.getElementById('groups-session-select').value;
    if (!sessionId) {
        Swal.fire({
            icon: 'warning',
            title: 'Select Session',
            text: 'Please select a session first.',
            confirmButtonColor: '#3085d6'
        });
        return;
    }
    
    try {
        const response = await fetch(`/api/sessions/${sessionId}/groups`);
        if (response.ok) {
            groups = await response.json();
            renderGroups();
            
            Swal.fire({
                icon: 'success',
                title: 'Groups Fetched!',
                text: `Found ${groups.length} groups.`,
                timer: 2000,
                showConfirmButton: false
            });
        } else {
            const errorData = await response.json();
            throw new Error(errorData.message);
        }
    } catch (error) {
        console.error('Failed to fetch groups:', error);
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: error.message || 'Failed to fetch groups',
            confirmButtonColor: '#3085d6'
        });
    }
}

function renderGroups() {
    const container = document.getElementById('groups-list');
    container.innerHTML = '';
    
    if (groups.length === 0) {
        container.innerHTML = '<p class="text-gray-500 text-center py-8">No groups found. Select a session and fetch groups.</p>';
        return;
    }
    
    groups.forEach(group => {
        const groupCard = document.createElement('div');
        groupCard.className = 'bg-white rounded-lg shadow p-4 card-hover transition-transform duration-200';
        groupCard.innerHTML = `
            <div class="flex items-center justify-between">
                <div class="flex items-center">
                    <div class="p-2 bg-purple-100 rounded-lg mr-3">
                        <i class="fas fa-users text-purple-600"></i>
                    </div>
                    <div>
                        <h3 class="font-semibold text-gray-900">${group.name}</h3>
                        <p class="text-sm text-gray-600">${group.participants} participants</p>
                        <p class="text-xs text-gray-500 font-mono">${group.id}</p>
                    </div>
                </div>
                <button class="text-blue-600 hover:text-blue-800" onclick="copyGroupId('${group.id}')">
                    <i class="fas fa-copy"></i>
                </button>
            </div>
        `;
        container.appendChild(groupCard);
    });
}

function copyGroupId(groupId) {
    navigator.clipboard.writeText(groupId).then(() => {
        Swal.fire({
            icon: 'success',
            title: 'Copied!',
            text: 'Group ID copied to clipboard.',
            timer: 1500,
            showConfirmButton: false
        });
    });
}

// Placeholder functions for session and task management
async function startSession(sessionId) {
    // Session starts automatically when needed
    Swal.fire({
        icon: 'info',
        title: 'Session Management',
        text: 'Sessions start automatically when tasks are started.',
        confirmButtonColor: '#3085d6'
    });
}

async function deleteSession(sessionId) {
    // Add delete functionality if needed
    Swal.fire({
        icon: 'warning',
        title: 'Delete Session',
        text: 'Session deletion not implemented yet.',
        confirmButtonColor: '#3085d6'
    });
}

async function deleteTask(taskId) {
    // Add delete functionality if needed
    Swal.fire({
        icon: 'warning',
        title: 'Delete Task',
        text: 'Task deletion not implemented yet.',
        confirmButtonColor: '#3085d6'
    });
}
