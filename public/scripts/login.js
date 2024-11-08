// Função para fazer login
async function handleLogin(event) {
    event.preventDefault();

    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const errorMessage = document.getElementById('errorMessage');
    const loading = document.getElementById('loading');
    const form = document.getElementById('loginForm');

    try {
        // Mostrar loading e desabilitar form
        loading.style.display = 'block';
        form.style.opacity = '0.7';
        form.style.pointerEvents = 'none';
        errorMessage.style.display = 'none';

        const response = await fetch('/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (response.ok) {
            // Login bem sucedido
            localStorage.setItem('token', data.token);
            showNotification('Login realizado com sucesso!', 'success');
            
            // Redirecionar após breve delay para mostrar a notificação
            setTimeout(() => {
                window.location.href = '/';
            }, 1000);
        } else {
            // Erro no login
            throw new Error(data.message || 'Erro ao fazer login');
        }
    } catch (error) {
        
        errorMessage.textContent = error.message || 'Usuário ou senha inválidos';
        errorMessage.style.display = 'block';
    } finally {
        // Esconder loading e reabilitar form
        loading.style.display = 'none';
        form.style.opacity = '1';
        form.style.pointerEvents = 'auto';
    }
}

// Função para mostrar/esconder senha
function togglePassword() {
    const passwordInput = document.getElementById('password');
    const toggleButton = document.querySelector('.password-toggle');
    
    if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        toggleButton.textContent = 'Ocultar';
    } else {
        passwordInput.type = 'password';
        toggleButton.textContent = 'Mostrar';
    }
}

// Sistema de notificações
function showNotification(message, type = 'info') {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.style.display = 'block';
    
    // Definir cor baseado no tipo
    switch (type) {
        case 'success':
            notification.style.backgroundColor = 'var(--success)';
            break;
        case 'error':
            notification.style.backgroundColor = 'var(--danger)';
            break;
        case 'warning':
            notification.style.backgroundColor = 'var(--warning)';
            notification.style.color = 'var(--bg-primary)';
            break;
        default:
            notification.style.backgroundColor = 'var(--accent)';
    }

    // Esconder após 3 segundos
    setTimeout(() => {
        notification.style.display = 'none';
    }, 3000);
}

// Verificar se já está logado
document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('token');
    if (token) {
        window.location.href = '/';
    }
});