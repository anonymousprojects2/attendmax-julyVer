document.addEventListener('DOMContentLoaded', function() {
    const loginForm = document.getElementById('loginForm');
    const tabButtons = document.querySelectorAll('.tab-btn');
    const roleInput = document.getElementById('roleInput');
    const errorMessage = document.getElementById('errorMessage');

    // Tab switching functionality
    tabButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            e.preventDefault();
            // Remove active class from all buttons
            tabButtons.forEach(btn => btn.classList.remove('active'));
            // Add active class to clicked button
            button.classList.add('active');
            // Update hidden role input
            roleInput.value = button.dataset.role;
        });
    });

    // Form submission
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorMessage.textContent = ''; // Clear any previous error

        const formData = {
            username: loginForm.username.value,
            password: loginForm.password.value,
            role: roleInput.value
        };

        console.log('Attempting login with:', formData);

        try {
            const response = await fetch('/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(formData)
            });

            const data = await response.json();
            console.log('Login response:', data);

            if (response.ok) {
                // Redirect based on role
                if (formData.role === 'admin') {
                    window.location.href = '/admin/dashboard';
                } else {
                    window.location.href = '/student/dashboard';
                }
            } else {
                errorMessage.textContent = data.message || 'Login failed. Please check your credentials.';
            }
        } catch (error) {
            console.error('Login error:', error);
            errorMessage.textContent = 'An error occurred. Please try again.';
        }
    });
});
