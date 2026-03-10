// ==========================================
// ALABOL GLOBAL CONFIGURATION & SUPABASE INIT
// ==========================================

const SUPABASE_URL = 'https://rgnunjngtsgqgvplawfr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJnbnVuam5ndHNncWd2cGxhd2ZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1ODcxMjksImV4cCI6MjA4ODE2MzEyOX0.8gd4XNoBI2mwbV54cORvVGOmJVwdzEidti38AcsqhB8';

// Initialize Supabase Client (requires supabase-js loaded before this via CDN)
let supabase;
if (typeof window.supabase !== 'undefined') {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log('✅ Supabase initialized successfully.');
} else {
    console.error('❌ Supabase JS library not loaded. Make sure to include the CDN script before config.js.');
}

// Global UI Helper Functions

/**
 * Muestra el Custom Alert Premium
 * @param {string} type 'success' | 'error' | 'warning'
 * @param {string} title Título de la alerta
 * @param {string} message Mensaje detallado
 */
function showCustomAlert(type, title, message) {
    let alertBox = document.getElementById('custom-alert');
    if (!alertBox) {
        // Create it if it doesn't exist
        alertBox = document.createElement('div');
        alertBox.id = 'custom-alert';
        alertBox.className = 'custom-alert';
        alertBox.innerHTML = `
            <div class="alert-icon" id="alert-icon"></div>
            <div class="alert-content">
                <h4 id="alert-title"></h4>
                <p id="alert-message"></p>
            </div>
            <button class="alert-close" onclick="closeCustomAlert()"><i class="fas fa-times"></i></button>
        `;
        document.body.appendChild(alertBox);

        // Add CSS dynamically if not present
        if (!document.getElementById('custom-alert-css')) {
            const style = document.createElement('style');
            style.id = 'custom-alert-css';
            style.innerHTML = `
                .custom-alert {
                    position: fixed; top: 20px; right: -400px; width: 350px;
                    background: rgba(10,31,26,0.95); backdrop-filter: blur(10px);
                    border-left: 4px solid var(--gold, #D4AF37);
                    border-top: 1px solid rgba(212,175,55,0.2); border-bottom: 1px solid rgba(212,175,55,0.2); border-right: 1px solid rgba(212,175,55,0.2);
                    border-radius: 8px; padding: 15px 20px;
                    display: flex; gap: 15px; align-items: flex-start;
                    box-shadow: 0 10px 30px rgba(0,0,0,0.5); z-index: 9999;
                    transition: right 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                    color: white; font-family: 'Poppins', sans-serif;
                }
                .custom-alert.show { right: 20px; }
                .alert-icon { font-size: 1.5rem; margin-top: 2px; }
                .alert-icon.success { color: #10B981; }
                .alert-icon.error { color: #EF4444; }
                .alert-icon.warning { color: var(--gold, #D4AF37); }
                .alert-content h4 { margin: 0 0 5px 0; font-size: 1rem; color: var(--gold, #D4AF37); font-weight: 600; }
                .alert-content p { margin: 0; font-size: 0.85rem; color: #a8c5b8; line-height: 1.4; }
                .alert-close { background: none; border: none; color: #a8c5b8; cursor: pointer; font-size: 1rem; padding: 0; margin-left: auto; transition: color 0.3s; }
                .alert-close:hover { color: white; }
            `;
            document.head.appendChild(style);
        }
    }

    const iconEl = document.getElementById('alert-icon');
    const titleEl = document.getElementById('alert-title');
    const messageEl = document.getElementById('alert-message');

    // Set content based on type
    if (type === 'success') {
        iconEl.innerHTML = '<i class="fas fa-check-circle"></i>';
        iconEl.className = 'alert-icon success';
        alertBox.style.borderLeftColor = '#10B981';
    } else if (type === 'error') {
        iconEl.innerHTML = '<i class="fas fa-exclamation-circle"></i>';
        iconEl.className = 'alert-icon error';
        alertBox.style.borderLeftColor = '#EF4444';
    } else {
        iconEl.innerHTML = '<i class="fas fa-bell"></i>';
        iconEl.className = 'alert-icon warning';
        alertBox.style.borderLeftColor = '#D4AF37';
    }

    titleEl.textContent = title;
    messageEl.textContent = message;

    // Show alert
    alertBox.classList.add('show');

    // Auto close after 5 seconds
    setTimeout(closeCustomAlert, 5000);
}

function closeCustomAlert() {
    const alertBox = document.getElementById('custom-alert');
    if (alertBox) {
        alertBox.classList.remove('show');
    }
}
