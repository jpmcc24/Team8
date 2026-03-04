// Tab switching
const loginTab          = document.getElementById('login-tab');
const createAccountTab  = document.getElementById('create-account-tab');
const logonForm         = document.getElementById('logon-form');
const createAccountForm = document.getElementById('create-account-form');
const loginMessageEl    = document.getElementById('message');
const createMessageEl   = document.getElementById('create-message');

function showMessage(el, text, type) {
    el.textContent = text;
    el.className = 'logon-message ' + type;
}

function clearMessage(el) {
    el.textContent = '';
    el.className = 'logon-message';
}

loginTab.addEventListener('click', () => {
    logonForm.classList.add('active-form');
    createAccountForm.classList.remove('active-form');
    loginTab.classList.add('active');
    createAccountTab.classList.remove('active');
    clearMessage(loginMessageEl);
});

createAccountTab.addEventListener('click', () => {
    createAccountForm.classList.add('active-form');
    logonForm.classList.remove('active-form');
    createAccountTab.classList.add('active');
    loginTab.classList.remove('active');
    clearMessage(createMessageEl);
});

// Sign In form submission
logonForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email    = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const btn      = logonForm.querySelector('button[type="submit"]');

    btn.disabled = true;
    clearMessage(loginMessageEl);

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });

        const result = await response.json();
        if (response.ok) {
            localStorage.setItem('jwtToken', result.token);
            window.location.href = '/dashboard';
        } else {
            showMessage(loginMessageEl, result.message, 'error');
            btn.disabled = false;
        }
    } catch (error) {
        console.error('Error:', error);
        showMessage(loginMessageEl, 'An error occurred. Please try again.', 'error');
        btn.disabled = false;
    }
});

// Create Account form submission
createAccountForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email    = document.getElementById('create-email').value;
    const password = document.getElementById('create-password').value;
    const btn      = createAccountForm.querySelector('button[type="submit"]');

    btn.disabled = true;
    clearMessage(createMessageEl);

    try {
        const response = await fetch('/api/create-account', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });

        const result = await response.json();
        if (response.ok) {
            // Pre-fill sign-in form and switch tabs
            document.getElementById('login-email').value    = email;
            document.getElementById('login-password').value = password;
            logonForm.classList.add('active-form');
            createAccountForm.classList.remove('active-form');
            loginTab.classList.add('active');
            createAccountTab.classList.remove('active');
            showMessage(loginMessageEl, 'Account created! You can now sign in.', 'success');
        } else {
            showMessage(createMessageEl, result.message, 'error');
            btn.disabled = false;
        }
    } catch (error) {
        console.error('Error:', error);
        showMessage(createMessageEl, 'An error occurred. Please try again.', 'error');
        btn.disabled = false;
    }
});