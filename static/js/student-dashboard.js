document.addEventListener('DOMContentLoaded', function() {
    // DOM Elements
    const menuToggle = document.getElementById('menuToggle');
    const sidebar = document.querySelector('.student-sidebar');
    const darkModeToggle = document.getElementById('darkModeToggle');
    const startScannerBtn = document.getElementById('startScanner');
    const scannerPlaceholder = document.getElementById('scanner-placeholder');
    const scanResult = document.getElementById('scanResult');
    const scanMessage = document.getElementById('scanMessage');
    const attendanceList = document.getElementById('attendanceList');
    const sidebarLinks = document.querySelectorAll('.sidebar-link');
    const contentSections = document.querySelectorAll('.content-section');

    let html5QrCode = null;
    let attendanceChart = null;
    let subjectChart = null;

    // Mobile menu toggle
    menuToggle.addEventListener('click', () => {
        sidebar.classList.toggle('active');
    });

    // Close sidebar when clicking outside on mobile
    document.addEventListener('click', (e) => {
        if (window.innerWidth <= 768) {
            if (!sidebar.contains(e.target) && !menuToggle.contains(e.target)) {
                sidebar.classList.remove('active');
            }
        }
    });

    // Handle window resize
    window.addEventListener('resize', () => {
        if (window.innerWidth > 768) {
            sidebar.classList.remove('active');
        }
    });

    // Dark mode toggle
    darkModeToggle.addEventListener('click', () => {
        document.body.classList.toggle('dark-mode');
        const isDarkMode = document.body.classList.contains('dark-mode');
        localStorage.setItem('darkMode', isDarkMode);
        darkModeToggle.innerHTML = isDarkMode ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
        
        // Update charts if they exist
        if (attendanceChart) attendanceChart.update();
        if (subjectChart) subjectChart.update();
    });

    // Check saved dark mode preference
    if (localStorage.getItem('darkMode') === 'true') {
        document.body.classList.add('dark-mode');
        darkModeToggle.innerHTML = '<i class="fas fa-sun"></i>';
    }

    // Navigation
    sidebarLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            
            // Update active states
            sidebarLinks.forEach(l => l.parentElement.classList.remove('active'));
            contentSections.forEach(section => section.classList.remove('active'));
            
            link.parentElement.classList.add('active');
            const sectionId = link.getAttribute('data-section');
            document.getElementById(sectionId).classList.add('active');
            
            // Close sidebar on mobile
            if (window.innerWidth <= 768) {
                sidebar.classList.remove('active');
            }

            // Load section data if needed
            if (sectionId === 'overview-section') {
                updateStats();
                initCharts();
            } else if (sectionId === 'history-section') {
                loadAttendanceHistory();
            } else if (sectionId === 'timetable-section') {
                loadTimetable();
            } else if (sectionId === 'subjects-section') {
                loadSubjects();
            } else if (sectionId === 'profile-section') {
                loadProfile();
            }
        });
    });

    // Get API URL
    function getApiUrl(endpoint) {
        if (window.API_CONFIG) {
            return API_CONFIG.getUrl(endpoint);
        }
        // Fallback if API_CONFIG is not available
        const baseUrl = window.location.hostname === 'localhost' 
            ? 'http://localhost:5000' 
            : 'https://attendmax-api.onrender.com';
        return `${baseUrl}${endpoint}`;
    }

    // Update stats
    function updateStats() {
        fetch(getApiUrl('/api/student/stats'), {
            credentials: 'same-origin'
        })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                console.error('Error:', data.error);
                return;
            }
            document.getElementById('totalClasses').textContent = data.totalClasses;
            document.getElementById('classesAttended').textContent = data.classesAttended;
            document.getElementById('attendancePercentage').textContent = 
                data.totalClasses > 0 
                    ? Math.round((data.classesAttended / data.totalClasses) * 100) + '%'
                    : '0%';
            
            // Update next class info
            if (data.nextClass) {
                document.getElementById('nextClass').textContent = 
                    `${data.nextClass.subject} at ${data.nextClass.time}`;
            }
        })
        .catch(error => console.error('Error fetching stats:', error));
    }

    // Initialize charts
    async function initCharts() {
        try {
            // Fetch attendance data from the server
            const response = await fetch(getApiUrl('/api/student/stats'), {
                credentials: 'same-origin'
            });
            const data = await response.json();
            
            if (data.error) {
                console.error('Error:', data.error);
                return;
            }

            // Calculate attendance percentages
            const totalClasses = data.totalClasses || 0;
            const attendedClasses = data.classesAttended || 0;
            const absentClasses = totalClasses - attendedClasses;

            // Fetch subject-wise attendance
            const subjectResponse = await fetch(getApiUrl('/api/student/subject-attendance'), {
                credentials: 'same-origin'
            });
            const subjectData = await subjectResponse.json();

            // Attendance Overview Chart
            const attendanceCtx = document.getElementById('attendanceChart').getContext('2d');
            if (attendanceChart) {
                attendanceChart.destroy();
            }
            
            attendanceChart = new Chart(attendanceCtx, {
                type: 'pie',
                data: {
                    labels: ['Present', 'Absent'],
                    datasets: [{
                        data: [attendedClasses, absentClasses],
                        backgroundColor: ['#3498db', '#e74c3c'],
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            display: true,
                            position: 'bottom'
                        },
                        title: {
                            display: true,
                            text: 'Overall Attendance'
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    const value = context.raw;
                                    const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                    const percentage = ((value / total) * 100).toFixed(1);
                                    return `${context.label}: ${value} classes (${percentage}%)`;
                                }
                            }
                        }
                    }
                }
            });

            // Subject-wise Attendance Chart
            const subjectCtx = document.getElementById('subjectChart').getContext('2d');
            if (subjectChart) {
                subjectChart.destroy();
            }
            
            const subjectLabels = subjectData.subjects.map(subject => subject.name);
            const subjectAttendance = subjectData.subjects.map(subject => subject.attendance);
            const subjectColors = [
                '#3498db', '#2ecc71', '#9b59b6', '#f1c40f', 
                '#e67e22', '#1abc9c', '#34495e', '#e74c3c'
            ];
            
            subjectChart = new Chart(subjectCtx, {
                type: 'pie',
                data: {
                    labels: subjectLabels,
                    datasets: [{
                        data: subjectAttendance,
                        backgroundColor: subjectColors.slice(0, subjectLabels.length),
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            display: true,
                            position: 'bottom'
                        },
                        title: {
                            display: true,
                            text: 'Subject-wise Attendance'
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    const value = context.raw;
                                    const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                    const percentage = ((value / total) * 100).toFixed(1);
                                    return `${context.label}: ${value} classes (${percentage}%)`;
                                }
                            }
                        }
                    }
                }
            });

        } catch (error) {
            console.error('Error initializing charts:', error);
        }
    }

    // Load attendance history
    function loadAttendanceHistory() {
        fetch(getApiUrl('/api/student/attendance-history'), {
            credentials: 'same-origin'
        })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                console.error('Error:', data.error);
                return;
            }
            
            if (data.history && data.history.length > 0) {
                attendanceList.innerHTML = data.history.map(record => `
                    <tr>
                        <td>${new Date(record.timestamp).toLocaleDateString()}</td>
                        <td>${record.subject}</td>
                        <td>${new Date(record.timestamp).toLocaleTimeString()}</td>
                        <td><span class="status-badge success">Present</span></td>
                    </tr>
                `).join('');
            } else {
                attendanceList.innerHTML = `
                    <tr>
                        <td colspan="4" class="text-center">No attendance records found</td>
                    </tr>
                `;
            }
        })
        .catch(error => console.error('Error fetching attendance history:', error));
    }

    // Load timetable
    function loadTimetable() {
        const timetableGrid = document.getElementById('timetableGrid');
        // Add time slots
        const timeSlots = ['9:00 AM', '10:00 AM', '11:00 AM', '12:00 PM', '2:00 PM', '3:00 PM'];
        const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
        
        // Add header row
        let html = '<div class="timetable-header">Time</div>';
        days.forEach(day => {
            html += `<div class="timetable-header">${day}</div>`;
        });
        
        // Add time slots
        timeSlots.forEach(time => {
            html += `<div class="timetable-header">${time}</div>`;
            days.forEach(() => {
                html += `<div class="timetable-slot"></div>`;
            });
        });
        
        timetableGrid.innerHTML = html;
    }

    // Load subjects
    function loadSubjects() {
        const subjectsGrid = document.getElementById('subjectsGrid');
        // Example subjects data
        const subjects = [
            { name: 'Mathematics', code: 'MATH101', attendance: 90 },
            { name: 'Physics', code: 'PHY101', attendance: 85 },
            { name: 'Computer Science', code: 'CS101', attendance: 95 },
            { name: 'Chemistry', code: 'CHEM101', attendance: 88 }
        ];
        
        subjectsGrid.innerHTML = subjects.map(subject => `
            <div class="subject-card">
                <div class="subject-header">
                    <div class="subject-icon">
                        <i class="fas fa-book"></i>
                    </div>
                    <div class="subject-info">
                        <h3>${subject.name}</h3>
                        <p>${subject.code}</p>
                    </div>
                </div>
                <div class="subject-stats">
                    <div class="subject-stat">
                        <div class="stat-value">${subject.attendance}%</div>
                        <div class="stat-label">Attendance</div>
                    </div>
                    <div class="subject-stat">
                        <div class="stat-value">${Math.round(subject.attendance * 0.3)}</div>
                        <div class="stat-label">Classes Attended</div>
                    </div>
                </div>
            </div>
        `).join('');
    }

    // Load profile
    function loadProfile() {
        // Fetch user profile data from server
        fetch(getApiUrl('/api/student/profile'), {
            credentials: 'same-origin'
        })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                console.error('Error:', data.error);
                return;
            }
            
            document.getElementById('profileName').textContent = data.name;
            document.getElementById('profileEmail').textContent = data.email;
            document.getElementById('profileDepartment').textContent = data.department;
            document.getElementById('profileYear').textContent = data.year;
            document.getElementById('profileRoll').textContent = data.rollNumber;
        })
        .catch(error => console.error('Error fetching profile:', error));
    }

    // QR Scanner functionality - Updated for API URLs
    startScannerBtn.addEventListener('click', startScanner);

    async function startScanner() {
        scannerPlaceholder.classList.add('hidden');
        scanResult.classList.add('hidden');
        
        if (html5QrCode && html5QrCode.isScanning) {
            await html5QrCode.stop();
            html5QrCode = null;
        }

        const config = {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0,
            showTorchButtonIfSupported: true
        };

        try {
            html5QrCode = new Html5Qrcode("qr-reader");
            const devices = await Html5Qrcode.getCameras();
            
            if (devices && devices.length) {
                try {
                    await html5QrCode.start(
                        { facingMode: "environment" },
                        config,
                        handleScan,
                        handleError
                    );
                } catch (err) {
                    console.log("Falling back to any available camera");
                    await html5QrCode.start(
                        devices[0].id,
                        config,
                        handleScan,
                        handleError
                    );
                }
            } else {
                showScanResult('No cameras found on your device.', false);
                scannerPlaceholder.classList.remove('hidden');
            }
        } catch (error) {
            console.error('Error starting scanner:', error);
            showScanResult('Error accessing camera. Please make sure you have granted camera permissions.', false);
            scannerPlaceholder.classList.remove('hidden');
        }
    }

    async function handleScan(qrCodeMessage) {
        try {
            if (html5QrCode && html5QrCode.isScanning) {
                await html5QrCode.stop();
                html5QrCode = null;
            }
            
            showScanResult('Processing QR code...', true);

            // Clean up QR code data
            let cleanQrData = qrCodeMessage;
            if (qrCodeMessage.startsWith('http')) {
                const urlParts = qrCodeMessage.split('/');
                cleanQrData = urlParts[urlParts.length - 1].replace('.png', '');
            }

            console.log('Sending QR data:', cleanQrData);

            const response = await fetch(getApiUrl('/api/student/mark-attendance'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                credentials: 'same-origin',
                body: JSON.stringify({ qrData: cleanQrData })
            });

            const data = await response.json();
            console.log('Server response:', data);

            if (data.success) {
                showScanResult(data.message || 'Attendance marked successfully', true);
                
                if (data.details) {
                    const detailsHtml = `
                        <div class="attendance-confirmation">
                            <h3>Attendance Confirmed</h3>
                            <p><strong>Subject:</strong> ${data.details.subject}</p>
                            <p><strong>Department:</strong> ${data.details.department} ${data.details.year}</p>
                            <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
                        </div>
                    `;
                    scanResult.innerHTML = detailsHtml;
                }
                
                // Update stats and charts
                await updateStats();
                await initCharts();
                await loadAttendanceHistory();
            } else {
                // Show the error message from the server
                showScanResult(data.message || 'Error marking attendance', false);
            }

        } catch (error) {
            console.error('Error marking attendance:', error);
            showScanResult('Network error. Please check your connection and try again.', false);
        } finally {
            scannerPlaceholder.classList.remove('hidden');
        }
    }

    function handleError(error) {
        console.error('QR Scanner error:', error);
        showScanResult('Error accessing camera. Please check camera permissions.', false);
    }

    function showScanResult(message, success) {
        scanResult.classList.remove('hidden', 'success', 'error');
        scanResult.classList.add(success ? 'success' : 'error');
        scanMessage.textContent = message;
        scanResult.style.display = 'block';
        
        // If it's an error, show the scanner placeholder again after 3 seconds
        if (!success) {
            setTimeout(() => {
                scannerPlaceholder.classList.remove('hidden');
            }, 3000);
        }
    }

    // Initial load
    updateStats();
    initCharts();
    loadProfile();
});
