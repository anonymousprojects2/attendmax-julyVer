document.addEventListener('DOMContentLoaded', function() {
    // DOM Elements
    const qrForm = document.getElementById('qrForm');
    const departmentSelect = document.getElementById('department');
    const yearSelect = document.getElementById('year');
    const semesterGroup = document.getElementById('semesterGroup');
    const semesterSelect = document.getElementById('semester');
    const subjectSelect = document.getElementById('subject');
    const attendanceTable = document.getElementById('attendanceTable');
    const filterForm = document.getElementById('filterForm');
    const sidebarLinks = document.querySelectorAll('.sidebar-link');
    const contentSections = document.querySelectorAll('.content-section');
    const darkModeToggle = document.getElementById('darkModeToggle');
    const regenerateQR = document.getElementById('regenerateQR');
    const exportRecords = document.getElementById('exportRecords');
    const prevPage = document.getElementById('prevPage');
    const nextPage = document.getElementById('nextPage');
    const pageInfo = document.getElementById('pageInfo');
    
    // Student Management Elements
    const addStudentBtn = document.getElementById('addStudentBtn');
    const importStudentsBtn = document.getElementById('importStudentsBtn');
    const studentModal = document.getElementById('studentModal');
    const closeModalBtn = document.querySelector('.close-modal');
    const saveStudentBtn = document.getElementById('saveStudentBtn');
    const cancelStudentBtn = document.getElementById('cancelStudentBtn');
    const studentForm = document.getElementById('studentForm');
    const studentSearchInput = document.getElementById('studentSearchInput');
    const studentDepartmentFilter = document.getElementById('studentDepartmentFilter');
    const studentYearFilter = document.getElementById('studentYearFilter');
    const studentYear = document.getElementById('studentYear');
    const studentSemester = document.getElementById('studentSemester');
    const studentPassword = document.getElementById('studentPassword');
    const passwordRequired = document.getElementById('passwordRequired');
    
    // Edit Attendance Elements
    const editAttendanceDate = document.getElementById('editAttendanceDate');
    const editAttendanceDepartment = document.getElementById('editAttendanceDepartment');
    const editAttendanceYear = document.getElementById('editAttendanceYear');
    const editAttendanceSemester = document.getElementById('editAttendanceSemester');
    const editAttendanceSubject = document.getElementById('editAttendanceSubject');
    const loadAttendanceBtn = document.getElementById('loadAttendanceBtn');
    const markAllPresentBtn = document.getElementById('markAllPresentBtn');
    const saveAttendanceChangesBtn = document.getElementById('saveAttendanceChangesBtn');
    
    // State variables
    let currentQrData = null;
    let qrTimer = null;
    let currentPage = 1;
    let totalPages = 1;
    let recordsPerPage = 10;
    let allRecords = [];
    let allStudents = [];
    let filteredStudents = [];
    let currentStudentPage = 1;
    let studentsPerPage = 10;
    let attendanceData = {
        subject: '',
        date: '',
        department: '',
        year: '',
        students: []
    };
    let attendanceChanged = false;
    
    // Initialize datepickers
    if (document.getElementById('datePicker')) {
        flatpickr("#datePicker", {
            dateFormat: "Y-m-d"
        });
    }
    
    if (editAttendanceDate) {
        flatpickr("#editAttendanceDate", {
            dateFormat: "Y-m-d",
            defaultDate: new Date()
        });
    }

    // Tab navigation
    sidebarLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            
            // Update active link
            sidebarLinks.forEach(l => {
                l.parentElement.classList.remove('active');
            });
            this.parentElement.classList.add('active');
            
            // Show corresponding section
            const targetId = this.getAttribute('data-section');
            contentSections.forEach(section => {
                section.classList.remove('active');
            });
            document.getElementById(targetId).classList.add('active');
            
            // Load data for the section if needed
            if (targetId === 'dashboard-section') {
                loadDashboardStats();
                initCharts();
            } else if (targetId === 'records-section') {
                loadAttendanceRecords();
            } else if (targetId === 'students-section') {
                loadStudents();
            } else if (targetId === 'qr-section') {
                // Nothing special needed for QR section initially
            }
        });
    });

    // Dark mode toggle
    darkModeToggle.addEventListener('click', function() {
        document.body.classList.toggle('dark-mode');
        const isDarkMode = document.body.classList.contains('dark-mode');
        
        // Update icon
        this.innerHTML = isDarkMode ? 
            '<i class="fas fa-sun"></i>' : 
            '<i class="fas fa-moon"></i>';
        
        // Save preference
        localStorage.setItem('darkMode', isDarkMode);
        
        // Redraw charts if they exist
        if (window.attendanceChart) window.attendanceChart.update();
        if (window.departmentChart) window.departmentChart.update();
    });
    
    // Check for saved dark mode preference
    if (localStorage.getItem('darkMode') === 'true') {
        document.body.classList.add('dark-mode');
        darkModeToggle.innerHTML = '<i class="fas fa-sun"></i>';
    }

    // Load dashboard stats
    function loadDashboardStats() {
        fetch('/api/admin/stats')
            .then(response => response.json())
            .then(data => {
                if (data.error) return;
                
                document.getElementById('totalStudents').textContent = data.totalStudents || 0;
                document.getElementById('todayAttendance').textContent = data.todayAttendance || 0;
                document.getElementById('activeSessions').textContent = data.activeSessions || 0;
                
                // Calculate total subjects from attendance records
                fetch('/api/admin/attendance-records')
                    .then(res => res.json())
                    .then(recordsData => {
                        if (recordsData.error) return;
                        
                        const uniqueSubjects = new Set();
                        recordsData.records.forEach(record => {
                            uniqueSubjects.add(record.subject);
                        });
                        document.getElementById('totalSubjects').textContent = uniqueSubjects.size;
                    });
            })
            .catch(error => {
                console.error('Error loading dashboard stats:', error);
            });
            
        // Load recent activity
        fetch('/api/admin/recent-activity')
            .then(response => response.json())
            .then(data => {
                const activityList = document.getElementById('recentActivityList');
                
                if (!data.activities || data.activities.length === 0) {
                    activityList.innerHTML = '<div class="activity-empty">No recent activities found</div>';
                    return;
                }
                
                activityList.innerHTML = '';
                data.activities.forEach(activity => {
                    const date = new Date(activity.timestamp);
                    activityList.innerHTML += `
                        <div class="activity-item">
                            <div class="activity-content">
                                <p>${activity.message}</p>
                                <small>${date.toLocaleString()}</small>
                            </div>
                        </div>
                    `;
                });
            });
    }

    // Initialize charts
    function initCharts() {
        // Get canvas contexts
        const attendanceCtx = document.getElementById('attendanceChart').getContext('2d');
        const departmentCtx = document.getElementById('departmentChart').getContext('2d');
        
        // Fetch attendance data for charts
        fetch('/api/admin/attendance-records')
            .then(response => response.json())
            .then(data => {
                if (data.error || !data.records) return;
                
                const records = data.records;
                
                // Prepare data for attendance trends chart (last 7 days)
                const last7Days = [];
                const attendanceCounts = [];
                
                for (let i = 6; i >= 0; i--) {
                    const date = new Date();
                    date.setDate(date.getDate() - i);
                    const dateString = date.toISOString().split('T')[0];
                    last7Days.push(dateString);
                    
                    // Count attendance for this day
                    const count = records.filter(record => {
                        const recordDate = new Date(record.timestamp);
                        return recordDate.toISOString().split('T')[0] === dateString;
                    }).length;
                    
                    attendanceCounts.push(count);
                }
                
                // Create attendance trends chart
                if (window.attendanceChart) {
                    window.attendanceChart.destroy();
                }
                
                window.attendanceChart = new Chart(attendanceCtx, {
                    type: 'line',
                    data: {
                        labels: last7Days,
                        datasets: [{
                            label: 'Daily Attendance',
                            data: attendanceCounts,
                            backgroundColor: 'rgba(52, 152, 219, 0.2)',
                            borderColor: '#3498db',
                            borderWidth: 2,
                            tension: 0.3
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: {
                            y: {
                                beginAtZero: true,
                                precision: 0
                            }
                        }
                    }
                });
                
                // Prepare data for department chart
                const departments = {};
                records.forEach(record => {
                    if (!departments[record.department]) {
                        departments[record.department] = 0;
                    }
                    departments[record.department]++;
                });
                
                const departmentLabels = Object.keys(departments);
                const departmentData = Object.values(departments);
                const backgroundColors = [
                    '#3498db', '#2ecc71', '#f1c40f', '#e74c3c', '#9b59b6',
                    '#1abc9c', '#d35400', '#34495e'
                ];
                
                // Create department chart
                if (window.departmentChart) {
                    window.departmentChart.destroy();
                }
                
                window.departmentChart = new Chart(departmentCtx, {
                    type: 'doughnut',
                    data: {
                        labels: departmentLabels,
                        datasets: [{
                            data: departmentData,
                            backgroundColor: backgroundColors.slice(0, departmentLabels.length),
                            borderWidth: 1
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: {
                                position: 'right'
                            }
                        }
                    }
                });
        });
    }

    // Function to update QR code timer
    function updateQrTimer(qrData) {
        if (!qrData) return;
        
        fetch(`/api/admin/qr-status/${qrData}`)
            .then(response => response.json())
            .then(data => {
                const timerElement = document.getElementById('qrTimer');
                if (!timerElement) return;

                if (!data.active) {
                    // QR code expired
                    timerElement.textContent = 'QR code expired';
                    timerElement.classList.add('expiring');
                    clearInterval(qrTimer);
                    return;
                }

                timerElement.textContent = `Expires in: ${data.timeRemaining}s`;
                if (data.timeRemaining <= 5) {
                    timerElement.classList.add('expiring');
                } else {
                    timerElement.classList.remove('expiring');
                }
            })
            .catch(error => {
                console.error('Error checking QR status:', error);
            });
    }

    // Subject data by department, year, and semester
    const subjectData = {
        'AIDS': {
            'FY': {
                'SEM1': ['Engineering Mathematics I', 'Engineering Physics', 'Engineering Chemistry', 'Basic Electrical Engineering', 'Programming for Problem Solving'],
                'SEM2': ['Engineering Mathematics II', 'Engineering Graphics', 'Environmental Science', 'Introduction to AI & DS', 'Python Programming']
            },
            'SY': {
                'SEM3': ['Data Structures', 'Database Management Systems', 'Statistical Methods for DS', 'Computer Organization', 'Discrete Mathematics'],
                'SEM4': ['Design & Analysis of Algorithms', 'Operating Systems', 'Machine Learning Fundamentals', 'Data Visualization', 'Web Technologies']
            },
            'TY': {
                'SEM5': ['Big Data Analytics', 'Deep Learning', 'Cloud Computing', 'Natural Language Processing', 'Data Mining'],
                'SEM6': ['Computer Vision', 'Reinforcement Learning', 'IoT & Data Analytics', 'Distributed Systems', 'Business Intelligence']
            },
            'LY': {
                'SEM7': ['AI Ethics & Governance', 'Advanced Machine Learning', 'Data Engineering', 'Project Management', 'Elective I'],
                'SEM8': ['Industry Internship', 'Capstone Project', 'Elective II', 'Elective III']
            }
        },
        'CSE': {
            'FY': {
                'SEM1': ['Engineering Mathematics I', 'Engineering Physics', 'Engineering Chemistry', 'Basic Electrical Engineering', 'Programming for Problem Solving'],
                'SEM2': ['Engineering Mathematics II', 'Engineering Graphics', 'Environmental Science', 'Introduction to Programming', 'Digital Logic']
            },
            'SY': {
                'SEM3': ['Data Structures', 'Database Management Systems', 'Computer Organization', 'Discrete Mathematics', 'Object Oriented Programming'],
                'SEM4': ['Design & Analysis of Algorithms', 'Operating Systems', 'Computer Networks', 'Software Engineering', 'Web Technologies']
            },
            'TY': {
                'SEM5': ['Theory of Computation', 'Compiler Design', 'Computer Graphics', 'Artificial Intelligence', 'Elective I'],
                'SEM6': ['Distributed Systems', 'Mobile Computing', 'Information Security', 'Machine Learning', 'Elective II']
            },
            'LY': {
                'SEM7': ['Big Data Analytics', 'Cloud Computing', 'Internet of Things', 'Project Management', 'Elective III'],
                'SEM8': ['Industry Internship', 'Capstone Project', 'Elective IV', 'Elective V']
            }
        },
        'CY': {
            'FY': {
                'SEM1': ['Engineering Mathematics I', 'Engineering Physics', 'Engineering Chemistry', 'Basic Electrical Engineering', 'Programming for Problem Solving'],
                'SEM2': ['Engineering Mathematics II', 'Engineering Graphics', 'Environmental Science', 'Introduction to Cybersecurity', 'Digital Logic']
            },
            'SY': {
                'SEM3': ['Data Structures', 'Database Management Systems', 'Computer Organization', 'Discrete Mathematics', 'Network Security Fundamentals'],
                'SEM4': ['Design & Analysis of Algorithms', 'Operating Systems', 'Computer Networks', 'Cryptography', 'Web Security']
            },
            'TY': {
                'SEM5': ['Information Security', 'Ethical Hacking', 'Digital Forensics', 'Secure Coding', 'Elective I'],
                'SEM6': ['Malware Analysis', 'Security Operations', 'Penetration Testing', 'Cloud Security', 'Elective II']
            },
            'LY': {
                'SEM7': ['Security Governance', 'Advanced Network Security', 'Mobile & IoT Security', 'Project Management', 'Elective III'],
                'SEM8': ['Industry Internship', 'Capstone Project', 'Elective IV', 'Elective V']
            }
        },
        'AIML': {
            'FY': {
                'SEM1': ['Engineering Mathematics I', 'Engineering Physics', 'Engineering Chemistry', 'Basic Electrical Engineering', 'Programming for Problem Solving'],
                'SEM2': ['Engineering Mathematics II', 'Engineering Graphics', 'Environmental Science', 'Introduction to AI & ML', 'Python Programming']
            },
            'SY': {
                'SEM3': ['Data Structures', 'Database Management Systems', 'Linear Algebra for ML', 'Computer Organization', 'Probability & Statistics'],
                'SEM4': ['Design & Analysis of Algorithms', 'Operating Systems', 'Machine Learning Fundamentals', 'Neural Networks', 'Web Technologies']
            },
            'TY': {
                'SEM5': ['Deep Learning', 'Natural Language Processing', 'Computer Vision', 'Reinforcement Learning', 'Elective I'],
                'SEM6': ['AI Applications', 'ML Operations', 'Big Data for ML', 'Generative AI', 'Elective II']
            },
            'LY': {
                'SEM7': ['AI Ethics', 'Advanced Deep Learning', 'Robotics & AI', 'Project Management', 'Elective III'],
                'SEM8': ['Industry Internship', 'Capstone Project', 'Elective IV', 'Elective V']
            }
        }
    };

    // Year to semester mapping
    const yearToSemesters = {
        'FY': ['SEM1', 'SEM2'],
        'SY': ['SEM3', 'SEM4'],
        'TY': ['SEM5', 'SEM6'],
        'LY': ['SEM7', 'SEM8']
    };

    // Semester display names
    const semesterNames = {
        'SEM1': 'Semester 1',
        'SEM2': 'Semester 2',
        'SEM3': 'Semester 3',
        'SEM4': 'Semester 4',
        'SEM5': 'Semester 5',
        'SEM6': 'Semester 6',
        'SEM7': 'Semester 7',
        'SEM8': 'Semester 8'
    };

    // Event listeners for dynamic form updates
    if (yearSelect) {
        yearSelect.addEventListener('change', function() {
            const selectedYear = this.value;
            
            // Clear and hide semester dropdown if no year selected
            if (!selectedYear) {
                semesterGroup.style.display = 'none';
                semesterSelect.innerHTML = '<option value="">Select Semester</option>';
                populateSubjects();
                return;
            }
            
            // Show semester dropdown and populate options
            semesterGroup.style.display = 'block';
            semesterSelect.innerHTML = '<option value="">Select Semester</option>';
            
            const semesters = yearToSemesters[selectedYear] || [];
            semesters.forEach(sem => {
                const option = document.createElement('option');
                option.value = sem;
                option.textContent = semesterNames[sem];
                semesterSelect.appendChild(option);
            });
            
            // Update subjects based on current selections
            populateSubjects();
        });
    }

    if (departmentSelect) {
        departmentSelect.addEventListener('change', function() {
            populateSubjects();
        });
    }

    if (semesterSelect) {
        semesterSelect.addEventListener('change', function() {
            populateSubjects();
        });
    }

    // Function to populate subjects based on department, year, and semester
    function populateSubjects() {
        if (!subjectSelect) return;
        
        const department = departmentSelect.value;
        const year = yearSelect.value;
        const semester = semesterSelect.value;
        
        // Clear current options
        subjectSelect.innerHTML = '<option value="">Select Subject</option>';
        
        // If any required field is missing, don't populate subjects
        if (!department || !year || !semester) {
            return;
        }
        
        // Get subjects for the selected combination
        const subjects = subjectData[department]?.[year]?.[semester] || [];
        
        // Add options to subject dropdown
        subjects.forEach(subject => {
            const option = document.createElement('option');
            option.value = subject;
            option.textContent = subject;
            subjectSelect.appendChild(option);
            });
    }

    // Function to generate new QR code
    function generateNewQrCode() {
        const department = document.getElementById('department').value;
        const year = document.getElementById('year').value;
        const semester = document.getElementById('semester').value;
        const subject = document.getElementById('subject').value;
        
        if (!department || !year || !semester || !subject) {
            alert('Please fill in all required fields');
            return;
        }
        
        fetch('/api/admin/generate-qr', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                department: department,
                year: year,
                semester: semester,
                subject: subject
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                throw new Error(data.error);
            }
            
            currentQrData = data.qrData;
            const qrContainer = document.getElementById('qrContainer');
            const imageContainer = qrContainer.querySelector('.qr-image-container');
            const infoContainer = document.getElementById('qrInfo');
            
            // Set QR image
            imageContainer.innerHTML = `<img src="${data.qrCodeUrl}" alt="QR Code">`;
            
            // Set QR info
            infoContainer.innerHTML = `
                <p><strong>Department:</strong> ${department}</p>
                <p><strong>Year:</strong> ${year}</p>
                <p><strong>Semester:</strong> ${semesterNames[semester]}</p>
                <p><strong>Subject:</strong> ${subject}</p>
                <p id="qrTimer" class="qr-timer">Expires in: ${data.expiresIn}s</p>
            `;
            
            qrContainer.classList.remove('hidden');

            // Clear existing timer if any
            if (qrTimer) {
                clearInterval(qrTimer);
            }

            // Start new timer
            qrTimer = setInterval(() => {
                updateQrTimer(currentQrData);
            }, 1000);
        })
        .catch(error => {
            console.error('Error generating QR code:', error);
            alert('Error generating QR code. Please try again.');
        });
    }

    // Generate QR Code form submission
    qrForm.addEventListener('submit', function(e) {
        e.preventDefault();
        generateNewQrCode();
    });



    // Regenerate QR code
    if (regenerateQR) {
        regenerateQR.addEventListener('click', function() {
            generateNewQrCode();
        });
    }

    // Handle filter form submission
    if (filterForm) {
        // Add event listener to populate semester dropdown based on year selection
        const filterYear = document.getElementById('filterYear');
        const filterSemester = document.getElementById('filterSemester');
        
        if (filterYear && filterSemester) {
            filterYear.addEventListener('change', function() {
                const selectedYear = this.value;
                
                // Clear current options
                filterSemester.innerHTML = '<option value="">All Semesters</option>';
                
                if (!selectedYear) return;
                
                // Populate semesters based on selected year
                const semesters = yearToSemesters[selectedYear] || [];
                semesters.forEach(sem => {
                    const option = document.createElement('option');
                    option.value = sem;
                    option.textContent = semesterNames[sem];
                    filterSemester.appendChild(option);
                });
            });
        }
        
        // Add event listener for edit attendance year dropdown
        const editAttendanceYear = document.getElementById('editAttendanceYear');
        const editAttendanceSemester = document.getElementById('editAttendanceSemester');
        
        if (editAttendanceYear && editAttendanceSemester) {
            editAttendanceYear.addEventListener('change', function() {
                const selectedYear = this.value;
                
                // Clear current options
                editAttendanceSemester.innerHTML = '<option value="">All Semesters</option>';
                
                if (!selectedYear) return;
                
                // Populate semesters based on selected year
                const semesters = yearToSemesters[selectedYear] || [];
                semesters.forEach(sem => {
                    const option = document.createElement('option');
                    option.value = sem;
                    option.textContent = semesterNames[sem];
                    editAttendanceSemester.appendChild(option);
                });
            });
        }

        filterForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            const filters = {
                department: document.getElementById('filterDepartment').value,
                year: document.getElementById('filterYear').value,
                semester: document.getElementById('filterSemester')?.value,
                subject: document.getElementById('filterSubject').value,
                date: document.getElementById('datePicker')?.value
            };

            // Remove empty filters
            Object.keys(filters).forEach(key => {
                if (!filters[key]) {
                    delete filters[key];
                }
            });

            loadAttendanceRecords(filters, 1); // Reset to page 1 when applying new filters
        });

        // Clear filters button
        document.getElementById('clearFilters')?.addEventListener('click', function() {
            filterForm.reset();
            loadAttendanceRecords({}, 1);
        });
    }

    // Load attendance records with filters and pagination
    function loadAttendanceRecords(filters = {}, page = 1) {
        let url = '/api/admin/attendance-records';
        const queryParams = new URLSearchParams(filters);
        if (queryParams.toString()) {
            url += '?' + queryParams.toString();
        }

        fetch(url)
            .then(response => response.json())
            .then(data => {
                if (data.error) {
                    throw new Error(data.error);
                }

                allRecords = data.records;
                totalPages = Math.ceil(allRecords.length / recordsPerPage);
                
                // Update pagination
                currentPage = page > totalPages ? totalPages : page;
                currentPage = currentPage < 1 ? 1 : currentPage;
                updatePagination();
                
                // Display records for current page
                displayRecordsForPage(currentPage);
            })
            .catch(error => {
                console.error('Error loading attendance records:', error);
                attendanceTable.querySelector('tbody').innerHTML = `
                    <tr>
                        <td colspan="6" style="text-align: center; color: #e74c3c;">
                            Error loading attendance records. Please try again.
                        </td>
                    </tr>
                `;
            });
    }

    // Display records for the current page
    function displayRecordsForPage(page) {
        const startIndex = (page - 1) * recordsPerPage;
        const endIndex = startIndex + recordsPerPage;
        const recordsToShow = allRecords.slice(startIndex, endIndex);
        
                const tbody = attendanceTable.querySelector('tbody');
                tbody.innerHTML = '';

        if (recordsToShow.length === 0) {
                    tbody.innerHTML = `
                        <tr>
                    <td colspan="6" style="text-align: center;">No attendance records found</td>
                        </tr>
                    `;
                    return;
                }

        recordsToShow.forEach(record => {
                    const date = new Date(record.timestamp);
                    tbody.innerHTML += `
                        <tr>
                            <td>${record.student_email}</td>
                            <td>${record.subject}</td>
                            <td>${record.department}</td>
                            <td>${record.year}</td>
                    <td>${record.semester || ''}</td>
                            <td>${date.toLocaleString()}</td>
                        </tr>
                    `;
                });
    }

    // Update pagination controls
    function updatePagination() {
        pageInfo.textContent = `Page ${currentPage} of ${totalPages || 1}`;
        prevPage.disabled = currentPage <= 1;
        nextPage.disabled = currentPage >= totalPages;
        
        // Add visual indication for disabled buttons
        if (prevPage.disabled) {
            prevPage.classList.add('disabled');
        } else {
            prevPage.classList.remove('disabled');
        }
        
        if (nextPage.disabled) {
            nextPage.classList.add('disabled');
        } else {
            nextPage.classList.remove('disabled');
        }
    }

    // Export records
    if (exportRecords) {
        exportRecords.addEventListener('click', function() {
            if (!allRecords || allRecords.length === 0) {
                alert('No records to export');
                return;
            }
            
            let csvContent = 'data:text/csv;charset=utf-8,';
            csvContent += 'Student Email,Subject,Department,Year,Timestamp\n';
            
            allRecords.forEach(record => {
                const date = new Date(record.timestamp).toLocaleString();
                csvContent += `${record.student_email},${record.subject},${record.department},${record.year},"${date}"\n`;
            });
            
            const encodedUri = encodeURI(csvContent);
            const link = document.createElement('a');
            link.setAttribute('href', encodedUri);
            link.setAttribute('download', `attendance_records_${new Date().toISOString().split('T')[0]}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        });
    }

    // Pagination controls
    if (prevPage) {
        prevPage.addEventListener('click', function() {
            if (currentPage > 1) {
                currentPage--;
                displayRecordsForPage(currentPage);
                updatePagination();
            }
        });
    }
    
    if (nextPage) {
        nextPage.addEventListener('click', function() {
            if (currentPage < totalPages) {
                currentPage++;
                displayRecordsForPage(currentPage);
                updatePagination();
            }
        });
    }

    // Report generation buttons
    document.querySelectorAll('.btn-report').forEach(btn => {
        btn.addEventListener('click', function() {
            const reportTitle = this.closest('.report-card').querySelector('h3').textContent;
            alert(`Generating ${reportTitle}... This feature will be implemented in a future update.`);
        });
    });

    // Student Management Functions
    function loadStudents() {
        // In a real app, this would fetch from your database
        // For now, we'll use mock data or fetch from Firebase
        fetch('/api/admin/students')
            .then(response => response.json())
            .then(data => {
                if (data.error) {
                    console.error('Error loading students:', data.error);
                    return;
                }
                
                allStudents = data.students || [];
                applyStudentFilters();
            })
            .catch(error => {
                console.error('Error loading students:', error);
                // For demo purposes, load mock data
                allStudents = getMockStudents();
                applyStudentFilters();
            });
    }
    
    function getMockStudents() {
        // Mock student data for demonstration
        return [
            { id: '1', name: 'John Doe', email: 'john.doe@example.com', department: 'CSE', year: 'FY', semester: 'SEM1' },
            { id: '2', name: 'Jane Smith', email: 'jane.smith@example.com', department: 'ECE', year: 'SY', semester: 'SEM3' },
            { id: '3', name: 'Bob Johnson', email: 'bob.johnson@example.com', department: 'ME', year: 'TY', semester: 'SEM5' },
            { id: '4', name: 'Alice Brown', email: 'alice.brown@example.com', department: 'CSE', year: 'LY', semester: 'SEM7' },
            { id: '5', name: 'Charlie Wilson', email: 'charlie.wilson@example.com', department: 'AIDS', year: 'FY', semester: 'SEM1' },
            { id: '6', name: 'Diana Miller', email: 'diana.miller@example.com', department: 'CE', year: 'SY', semester: 'SEM3' },
            { id: '7', name: 'Edward Davis', email: 'edward.davis@example.com', department: 'CSE', year: 'TY', semester: 'SEM5' },
            { id: '8', name: 'Fiona Garcia', email: 'fiona.garcia@example.com', department: 'ECE', year: 'LY', semester: 'SEM7' },
            { id: '9', name: 'George Martinez', email: 'george.martinez@example.com', department: 'ME', year: 'FY', semester: 'SEM1' },
            { id: '10', name: 'Hannah Robinson', email: 'hannah.robinson@example.com', department: 'CSE', year: 'SY', semester: 'SEM3' },
            { id: '11', name: 'Ian Clark', email: 'ian.clark@example.com', department: 'AIDS', year: 'TY', semester: 'SEM5' },
            { id: '12', name: 'Julia Lewis', email: 'julia.lewis@example.com', department: 'CE', year: 'LY', semester: 'SEM7' }
        ];
    }
    
    function applyStudentFilters() {
        const searchTerm = studentSearchInput ? studentSearchInput.value.toLowerCase() : '';
        const departmentFilter = studentDepartmentFilter ? studentDepartmentFilter.value : '';
        const yearFilter = studentYearFilter ? studentYearFilter.value : '';
        
        filteredStudents = allStudents.filter(student => {
            const matchesSearch = !searchTerm || 
                student.name.toLowerCase().includes(searchTerm) || 
                student.email.toLowerCase().includes(searchTerm);
                
            const matchesDepartment = !departmentFilter || student.department === departmentFilter;
            const matchesYear = !yearFilter || student.year === yearFilter;
            
            return matchesSearch && matchesDepartment && matchesYear;
        });
        
        displayStudents(1);
    }
    
    function displayStudents(page) {
        const studentsTable = document.getElementById('studentsTable');
        if (!studentsTable) return;
        
        const tbody = studentsTable.querySelector('tbody');
        const startIndex = (page - 1) * studentsPerPage;
        const endIndex = startIndex + studentsPerPage;
        const studentsToShow = filteredStudents.slice(startIndex, endIndex);
        
        tbody.innerHTML = '';
        
        if (studentsToShow.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" class="text-center">No students found</td>
                </tr>
            `;
            return;
        }
        
        studentsToShow.forEach(student => {
            tbody.innerHTML += `
                <tr>
                    <td>${student.name}</td>
                    <td>${student.email}</td>
                    <td>${student.department}</td>
                    <td>${student.year}</td>
                    <td>${student.semester}</td>
                    <td>
                        <div class="action-buttons">
                            <button class="action-btn edit" data-id="${student.id}">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="action-btn delete" data-id="${student.id}">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                        </td>
                    </tr>
                `;
            });
        
        // Add event listeners to action buttons
        tbody.querySelectorAll('.action-btn.edit').forEach(btn => {
            btn.addEventListener('click', function() {
                const studentId = this.getAttribute('data-id');
                editStudent(studentId);
            });
        });
        
        tbody.querySelectorAll('.action-btn.delete').forEach(btn => {
            btn.addEventListener('click', function() {
                const studentId = this.getAttribute('data-id');
                deleteStudent(studentId);
            });
        });
        
        // Update pagination
        currentStudentPage = page;
        const totalStudentPages = Math.ceil(filteredStudents.length / studentsPerPage);
        const studentsPageInfo = document.getElementById('studentsPageInfo');
        if (studentsPageInfo) {
            studentsPageInfo.textContent = `Page ${currentStudentPage} of ${totalStudentPages || 1}`;
        }
        
        const studentsPrevPage = document.getElementById('studentsPrevPage');
        const studentsNextPage = document.getElementById('studentsNextPage');
        
        if (studentsPrevPage) {
            studentsPrevPage.disabled = currentStudentPage <= 1;
            if (studentsPrevPage.disabled) {
                studentsPrevPage.classList.add('disabled');
            } else {
                studentsPrevPage.classList.remove('disabled');
            }
        }
        
        if (studentsNextPage) {
            studentsNextPage.disabled = currentStudentPage >= totalStudentPages;
            if (studentsNextPage.disabled) {
                studentsNextPage.classList.add('disabled');
            } else {
                studentsNextPage.classList.remove('disabled');
            }
        }
    }
    
    // Student pagination controls
    document.getElementById('studentsPrevPage')?.addEventListener('click', function() {
        if (currentStudentPage > 1) {
            displayStudents(currentStudentPage - 1);
        }
    });
    
    document.getElementById('studentsNextPage')?.addEventListener('click', function() {
        const totalStudentPages = Math.ceil(filteredStudents.length / studentsPerPage);
        if (currentStudentPage < totalStudentPages) {
            displayStudents(currentStudentPage + 1);
        }
    });
    
    // Student search and filters
    if (studentSearchInput) {
        studentSearchInput.addEventListener('input', function() {
            applyStudentFilters();
        });
    }
    
    if (studentDepartmentFilter) {
        studentDepartmentFilter.addEventListener('change', function() {
            applyStudentFilters();
        });
    }
    
    if (studentYearFilter) {
        studentYearFilter.addEventListener('change', function() {
            applyStudentFilters();
        });
    }
    
    // Student modal functions
    function openStudentModal(title = 'Add New Student', student = null) {
        if (!studentModal) return;
        
        document.getElementById('studentModalTitle').textContent = title;
        document.getElementById('studentId').value = student ? student.id : '';
        document.getElementById('studentName').value = student ? student.name : '';
        document.getElementById('studentEmail').value = student ? student.email : '';
        document.getElementById('studentDepartment').value = student ? student.department : '';
        document.getElementById('studentYear').value = student ? student.year : '';
        
        // Reset and populate semester dropdown based on year
        const selectedYear = student ? student.year : '';
        populateStudentSemester(selectedYear);
        
        if (student && student.semester) {
            document.getElementById('studentSemester').value = student.semester;
        }
        
        document.getElementById('studentPassword').value = '';
        
        // Password is required for new students, optional for editing
        if (student) {
            studentPassword.required = false;
            passwordRequired.style.display = 'none';
            studentPassword.placeholder = 'Leave blank to keep unchanged';
        } else {
            studentPassword.required = true;
            passwordRequired.style.display = 'inline';
            studentPassword.placeholder = 'Minimum 6 characters';
        }
        
        studentModal.style.display = 'block';
    }
    
    // Populate semester dropdown based on selected year
    function populateStudentSemester(year) {
        if (!studentSemester) return;
        
        // Clear current options
        studentSemester.innerHTML = '<option value="">Select Semester</option>';
        
        if (!year) return;
        
        // Get semesters for the selected year
        const semesters = yearToSemesters[year] || [];
        
        // Add options to semester dropdown
        semesters.forEach(sem => {
            const option = document.createElement('option');
            option.value = sem;
            option.textContent = semesterNames[sem];
            studentSemester.appendChild(option);
        });
    }
    
    // Add event listener for year dropdown to populate semester options
    if (studentYear) {
        studentYear.addEventListener('change', function() {
            populateStudentSemester(this.value);
        });
    }
    
    function closeStudentModal() {
        if (!studentModal) return;
        studentModal.style.display = 'none';
        studentForm.reset();
    }
    
    function editStudent(studentId) {
        const student = allStudents.find(s => s.id === studentId);
        if (student) {
            openStudentModal('Edit Student', student);
        }
    }
    
    function deleteStudent(studentId) {
        if (confirm('Are you sure you want to delete this student?')) {
            // Call the API to delete the student
            fetch(`/api/admin/students/${studentId}`, {
                method: 'DELETE'
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    // Remove from our arrays
                    allStudents = allStudents.filter(s => s.id !== studentId);
                    applyStudentFilters(); // This will update the table
                    alert('Student deleted successfully');
                } else {
                    alert(data.error || 'Error deleting student');
                }
            })
            .catch(error => {
                console.error('Error deleting student:', error);
                alert('Error deleting student. Please try again.');
            });
        }
    }
    
    // Student modal event listeners
    if (addStudentBtn) {
        addStudentBtn.addEventListener('click', function() {
            openStudentModal();
        });
    }
    
    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', closeStudentModal);
    }
    
    if (cancelStudentBtn) {
        cancelStudentBtn.addEventListener('click', closeStudentModal);
    }
    
    if (saveStudentBtn) {
        saveStudentBtn.addEventListener('click', function() {
            const studentId = document.getElementById('studentId').value;
            const name = document.getElementById('studentName').value;
            const email = document.getElementById('studentEmail').value;
            const department = document.getElementById('studentDepartment').value;
            const year = document.getElementById('studentYear').value;
            const semester = document.getElementById('studentSemester').value;
            const password = document.getElementById('studentPassword').value;
            
            if (!name || !email || !department || !year || !semester) {
                alert('Please fill in all required fields');
                return;
            }
            
            if (!studentId && !password) {
                alert('Password is required for new students');
                return;
            }
            
            if (password && password.length < 6) {
                alert('Password must be at least 6 characters long');
                return;
            }
            
            // Prepare data for API call
            const studentData = {
                name,
                email,
                department,
                year,
                semester
            };
            
            if (password) {
                studentData.password = password;
            }
            
            // Show loading state
            saveStudentBtn.disabled = true;
            saveStudentBtn.textContent = 'Saving...';
            
            if (studentId) {
                // Update existing student
                fetch(`/api/admin/students/${studentId}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(studentData)
                })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        // Update student in our array
                        const studentIndex = allStudents.findIndex(s => s.id === studentId);
                        if (studentIndex !== -1) {
                            allStudents[studentIndex] = {
                                ...allStudents[studentIndex],
                                name,
                                email,
                                department,
                                year,
                                semester
                            };
                        }
                        closeStudentModal();
                        applyStudentFilters(); // Update the table
                        alert('Student updated successfully');
                    } else {
                        alert(data.error || 'Error updating student');
                    }
                })
                .catch(error => {
                    console.error('Error updating student:', error);
                    alert('Error updating student. Please try again.');
                })
                .finally(() => {
                    saveStudentBtn.disabled = false;
                    saveStudentBtn.textContent = 'Save Student';
                });
            } else {
                // Add new student
                fetch('/api/admin/students', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(studentData)
                })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        // Add new student to our array
                        allStudents.push(data.student);
                        closeStudentModal();
                        applyStudentFilters(); // Update the table
                        alert('Student added successfully');
                    } else {
                        alert(data.error || 'Error adding student');
                    }
                })
                .catch(error => {
                    console.error('Error adding student:', error);
                    alert('Error adding student. Please try again.');
                })
                .finally(() => {
                    saveStudentBtn.disabled = false;
                    saveStudentBtn.textContent = 'Save Student';
                });
            }
        });
    }
    
    if (importStudentsBtn) {
        importStudentsBtn.addEventListener('click', function() {
            alert('Import Students feature will be implemented in a future update.');
        });
    }
    
    // Edit Attendance Functions
    function loadAttendanceForEdit() {
        const subject = document.getElementById('editAttendanceSubject').value;
        const department = document.getElementById('editAttendanceDepartment').value;
        const year = document.getElementById('editAttendanceYear').value;
        const semester = document.getElementById('editAttendanceSemester').value;
        const date = document.getElementById('editAttendanceDate').value;
        
        if (!subject || !date) {
            alert('Please enter a subject and select a date');
            return;
        }
        
        // Store current filters
        attendanceData = {
            subject,
            department,
            year,
            semester,
            date,
            students: []
        };
        
        // Update info display
        document.getElementById('attendanceSubjectInfo').textContent = subject;
        document.getElementById('attendanceDateInfo').textContent = date;
        
        // Get students for the selected department and year
        loadStudentsForAttendance(department, year);
    }
    
    // Function to load students based on department and year
    function loadStudentsForAttendance(department, year) {
        if (!department || !year) {
            // Clear the table if department or year is not selected
            const table = document.getElementById('editAttendanceTable');
            if (table) {
                const tbody = table.querySelector('tbody');
                tbody.innerHTML = `
                    <tr>
                        <td colspan="4" class="text-center">Please select department and year to view students</td>
                    </tr>
                `;
            }
            
            // Reset attendance stats
            document.getElementById('totalStudentsCount').textContent = '0';
            document.getElementById('presentStudentsCount').textContent = '0';
            document.getElementById('absentStudentsCount').textContent = '0';
            document.getElementById('attendancePercentage').textContent = '0%';
            
            return;
    }

        // In a real app, this would fetch students from your API based on department and year
        // For now, we'll filter from our allStudents array
        const studentsForClass = allStudents.filter(student => {
            return (!department || student.department === department) && 
                   (!year || student.year === year);
        });
        
        // Generate attendance data with random status or get from existing records
        attendanceData.students = studentsForClass.map(student => {
            // Check if we already have attendance data for this student
            const existingRecord = attendanceData.students.find(s => s.id === student.id);
            
            // If we have existing data, use it; otherwise, set as absent by default
            const status = existingRecord ? existingRecord.status : 'absent';
            
            return {
                id: student.id,
                name: student.name,
                email: student.email,
                status: status
            };
        });
        
        displayAttendanceData();
    }
    
    // Event listeners for department and year dropdowns in Edit Attendance section
    if (editAttendanceDepartment) {
        editAttendanceDepartment.addEventListener('change', function() {
            const department = this.value;
            const year = editAttendanceYear.value;
            
            if (department && year) {
                loadStudentsForAttendance(department, year);
            }
        });
    }
    
    if (editAttendanceYear) {
        editAttendanceYear.addEventListener('change', function() {
            const year = this.value;
            const department = editAttendanceDepartment.value;
            
            if (department && year) {
                loadStudentsForAttendance(department, year);
            }
        });
    }

    function displayAttendanceData() {
        const table = document.getElementById('editAttendanceTable');
        if (!table) return;
        
        const tbody = table.querySelector('tbody');
        tbody.innerHTML = '';
        
        if (attendanceData.students.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="4" class="text-center">No students found for the selected criteria</td>
                </tr>
            `;
            return;
        }
        
        attendanceData.students.forEach(student => {
            tbody.innerHTML += `
                <tr>
                    <td>${student.name}</td>
                    <td>${student.email}</td>
                    <td>${student.status === 'present' ? 'Present' : 'Absent'}</td>
                    <td>
                        <div class="status-toggle" data-student-id="${student.id}">
                            <button class="status-btn present ${student.status === 'present' ? 'active' : ''}">
                                <i class="fas fa-check"></i> Present
                            </button>
                            <button class="status-btn absent ${student.status === 'absent' ? 'active' : ''}">
                                <i class="fas fa-times"></i> Absent
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        });

        // Add event listeners to status toggle buttons
        tbody.querySelectorAll('.status-toggle').forEach(toggle => {
            const studentId = toggle.getAttribute('data-student-id');
            const presentBtn = toggle.querySelector('.status-btn.present');
            const absentBtn = toggle.querySelector('.status-btn.absent');
            
            presentBtn.addEventListener('click', function() {
                updateStudentStatus(studentId, 'present');
                presentBtn.classList.add('active');
                absentBtn.classList.remove('active');
            });
            
            absentBtn.addEventListener('click', function() {
                updateStudentStatus(studentId, 'absent');
                absentBtn.classList.add('active');
                presentBtn.classList.remove('active');
            });
        });
        
        // Update attendance stats
        updateAttendanceStats();
    }
    
    function updateStudentStatus(studentId, status) {
        const studentIndex = attendanceData.students.findIndex(s => s.id === studentId);
        if (studentIndex !== -1) {
            attendanceData.students[studentIndex].status = status;
            attendanceChanged = true;
            updateAttendanceStats();
        }
    }
    
    function updateAttendanceStats() {
        const totalStudents = attendanceData.students.length;
        const presentStudents = attendanceData.students.filter(s => s.status === 'present').length;
        const absentStudents = totalStudents - presentStudents;
        const attendancePercentage = totalStudents > 0 ? Math.round((presentStudents / totalStudents) * 100) : 0;
        
        document.getElementById('totalStudentsCount').textContent = totalStudents;
        document.getElementById('presentStudentsCount').textContent = presentStudents;
        document.getElementById('absentStudentsCount').textContent = absentStudents;
        document.getElementById('attendancePercentage').textContent = `${attendancePercentage}%`;
    }
    
    // Edit Attendance event listeners
    if (loadAttendanceBtn) {
        loadAttendanceBtn.addEventListener('click', function() {
            loadAttendanceForEdit();
        });
    }
    
    if (markAllPresentBtn) {
        markAllPresentBtn.addEventListener('click', function() {
            attendanceData.students.forEach(student => {
                student.status = 'present';
            });
            attendanceChanged = true;
            displayAttendanceData();
        });
    }
    
    if (saveAttendanceChangesBtn) {
        saveAttendanceChangesBtn.addEventListener('click', function() {
            if (!attendanceChanged) {
                alert('No changes to save');
                return;
            }
            
            // In a real app, this would call your API to save the changes
            alert('Attendance changes saved successfully!');
            attendanceChanged = false;
        });
    }

    // Initial load of dashboard data
    loadDashboardStats();
    initCharts();

    // Initial load of attendance records
    loadAttendanceRecords();

    // Clean up timer when leaving page
    window.addEventListener('beforeunload', () => {
        if (qrTimer) {
            clearInterval(qrTimer);
        }
    });

    // ERP Module Elements
    const facultyTable = document.getElementById('facultyTable');
    const coursesTable = document.getElementById('coursesTable');
    const timetableGrid = document.querySelector('.timetable-grid');
    const examsTable = document.getElementById('examsTable');
    const resultsTable = document.getElementById('resultsTable');
    const libraryTable = document.getElementById('libraryTable');
    const feesTable = document.getElementById('feesTable');
    const notificationsList = document.querySelector('.notifications-list');

    // Faculty Management
    const addFacultyBtn = document.getElementById('addFacultyBtn');
    const importFacultyBtn = document.getElementById('importFacultyBtn');
    const facultySearchInput = document.getElementById('facultySearchInput');
    const facultyDepartmentFilter = document.getElementById('facultyDepartmentFilter');
    const facultyStatusFilter = document.getElementById('facultyStatusFilter');

    // Course Management
    const addCourseBtn = document.getElementById('addCourseBtn');
    const manageCurriculumBtn = document.getElementById('manageCurriculumBtn');
    const courseSearchInput = document.getElementById('courseSearchInput');
    const courseDepartmentFilter = document.getElementById('courseDepartmentFilter');
    const courseSemesterFilter = document.getElementById('courseSemesterFilter');

    // Timetable Management
    const generateTimetableBtn = document.getElementById('generateTimetableBtn');
    const editTimetableBtn = document.getElementById('editTimetableBtn');
    const publishTimetableBtn = document.getElementById('publishTimetableBtn');
    const timetableDepartment = document.getElementById('timetableDepartment');
    const timetableYear = document.getElementById('timetableYear');
    const timetableSemester = document.getElementById('timetableSemester');

    // Exam Management
    const scheduleExamBtn = document.getElementById('scheduleExamBtn');
    const manageSeatingBtn = document.getElementById('manageSeatingBtn');
    const assignInvigilatorsBtn = document.getElementById('assignInvigilatorsBtn');
    const examType = document.getElementById('examType');
    const examDepartment = document.getElementById('examDepartment');
    const examStatus = document.getElementById('examStatus');

    // Results Management
    const uploadResultsBtn = document.getElementById('uploadResultsBtn');
    const generateGradesBtn = document.getElementById('generateGradesBtn');
    const publishResultsBtn = document.getElementById('publishResultsBtn');
    const resultsDepartment = document.getElementById('resultsDepartment');
    const resultsExamType = document.getElementById('resultsExamType');
    const resultsStatus = document.getElementById('resultsStatus');

    // Library Management
    const addBookBtn = document.getElementById('addBookBtn');
    const manageIssuedBtn = document.getElementById('manageIssuedBtn');
    const generateReportBtn = document.getElementById('generateReportBtn');
    const bookSearchInput = document.getElementById('bookSearchInput');
    const bookCategory = document.getElementById('bookCategory');
    const bookStatus = document.getElementById('bookStatus');

    // Fees Management
    const generateChallanBtn = document.getElementById('generateChallanBtn');
    const recordPaymentBtn = document.getElementById('recordPaymentBtn');
    const feesReportBtn = document.getElementById('feesReportBtn');
    const feesSearchInput = document.getElementById('feesSearchInput');
    const feesDepartment = document.getElementById('feesDepartment');
    const feesStatus = document.getElementById('feesStatus');

    // Notifications Management
    const createNotificationBtn = document.getElementById('createNotificationBtn');
    const scheduleNotificationBtn = document.getElementById('scheduleNotificationBtn');
    const notificationType = document.getElementById('notificationType');
    const notificationStatus = document.getElementById('notificationStatus');

    // Global error handling
    window.handleError = function(error, context) {
        console.error(`Error in ${context}:`, error);
        const errorMessage = error.response?.data?.error || error.message || 'An unexpected error occurred';
        showNotification(errorMessage, 'error');
    };

    // Notification system
    function showNotification(message, type = 'success') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <div class="notification-content">
                <i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i>
                <span>${message}</span>
            </div>
            <button class="notification-close">&times;</button>
        `;
        document.body.appendChild(notification);

        // Auto-hide after 5 seconds
        setTimeout(() => {
            notification.remove();
        }, 5000);

        // Close button
        notification.querySelector('.notification-close').addEventListener('click', () => {
            notification.remove();
        });
    }

    // API Calls
    const api = {
        async get(endpoint) {
            try {
                const response = await fetch(endpoint);
                if (!response.ok) throw new Error('Network response was not ok');
                return await response.json();
            } catch (error) {
                throw error;
            }
        },

        async post(endpoint, data) {
            try {
                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(data)
                });
                if (!response.ok) throw new Error('Network response was not ok');
                return await response.json();
            } catch (error) {
                throw error;
            }
        }
    };

    // Form Validation
    function validateForm(formData, requiredFields) {
        const errors = [];
        requiredFields.forEach(field => {
            if (!formData[field]) {
                errors.push(`${field.replace('_', ' ')} is required`);
            }
        });
        return errors;
    }

    // Faculty Management
    async function loadFacultyData() {
        try {
            const data = await api.get('/api/faculty');
            if (data.error) throw new Error(data.error);
            
            const tbody = facultyTable.querySelector('tbody');
            tbody.innerHTML = '';
            
            data.faculty.forEach(faculty => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${faculty.name}</td>
                    <td>${faculty.email}</td>
                    <td>${faculty.department}</td>
                    <td>${faculty.designation}</td>
                    <td>${faculty.subjects}</td>
                    <td><span class="status-badge ${faculty.status}">${faculty.status}</span></td>
                    <td>
                        <button class="btn-icon" onclick="editFaculty('${faculty.email}')">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn-icon" onclick="deleteFaculty('${faculty.email}')">
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                `;
                tbody.appendChild(row);
            });
        } catch (error) {
            handleError(error, 'loadFacultyData');
        }
    }

    // Course Management
    async function loadCourseData() {
        try {
            const data = await api.get('/api/courses');
            if (data.error) throw new Error(data.error);
            
            const tbody = coursesTable.querySelector('tbody');
            tbody.innerHTML = '';
            
            data.courses.forEach(course => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${course.code}</td>
                    <td>${course.name}</td>
                    <td>${course.department}</td>
                    <td>${course.credits}</td>
                    <td>${course.semester}</td>
                    <td>${course.faculty}</td>
                    <td>
                        <button class="btn-icon" onclick="editCourse('${course.code}')">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn-icon" onclick="deleteCourse('${course.code}')">
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                `;
                tbody.appendChild(row);
            });
        } catch (error) {
            handleError(error, 'loadCourseData');
        }
    }

    // Timetable Management
    async function loadTimetable() {
        try {
            const department = timetableDepartment.value;
            const year = timetableYear.value;
            const semester = timetableSemester.value;
            
            if (!department || !year || !semester) {
                showNotification('Please select department, year, and semester', 'error');
                return;
            }
            
            const data = await api.get(`/api/timetable?department=${department}&year=${year}&semester=${semester}`);
            if (data.error) throw new Error(data.error);
            
            generateTimetable(data.timetable);
        } catch (error) {
            handleError(error, 'loadTimetable');
        }
    }

    function generateTimetable(data = []) {
        const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const slots = ['9:00 AM', '10:00 AM', '11:00 AM', '12:00 PM', '2:00 PM', '3:00 PM', '4:00 PM'];
        
        timetableGrid.innerHTML = '';
        
        // Add header row
        days.forEach(day => {
            const header = document.createElement('div');
            header.className = 'timetable-header';
            header.textContent = day;
            timetableGrid.appendChild(header);
        });
        
        // Add time slots
        slots.forEach(slot => {
            days.forEach(day => {
                const slotData = data.find(d => d.day === day && d.time === slot);
                const slotDiv = document.createElement('div');
                slotDiv.className = `timetable-slot ${slotData ? 'occupied' : ''}`;
                slotDiv.innerHTML = `
                    <div class="slot-time">${slot}</div>
                    <div class="slot-content">
                        ${slotData ? `
                            <div class="slot-subject">${slotData.subject}</div>
                            <div class="slot-faculty">${slotData.faculty}</div>
                            <div class="slot-room">${slotData.room}</div>
                        ` : ''}
                    </div>
                `;
                timetableGrid.appendChild(slotDiv);
            });
        });
    }

    // Modal Functions
    function showModal(title, content = '', onSave = null) {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2 class="modal-title">${title}</h2>
                    <button class="close-modal">&times;</button>
                </div>
                <div class="modal-body">
                    ${content}
                </div>
                <div class="modal-footer">
                    <button class="btn-secondary" onclick="closeModal(this)">Cancel</button>
                    <button class="btn-primary" onclick="saveModal(this)">Save</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.style.display = 'block';
        
        if (onSave) {
            modal.querySelector('.btn-primary').onclick = () => {
                onSave(modal);
            };
        }
        
        modal.querySelector('.close-modal').addEventListener('click', () => {
            modal.remove();
        });
    }

    // Event Listeners
    if (addFacultyBtn) {
        addFacultyBtn.addEventListener('click', () => {
            const content = `
                <form id="facultyForm">
                    <div class="form-group">
                        <label for="name">Name</label>
                        <input type="text" id="name" name="name" required>
                    </div>
                    <div class="form-group">
                        <label for="email">Email</label>
                        <input type="email" id="email" name="email" required>
                    </div>
                    <div class="form-group">
                        <label for="department">Department</label>
                        <select id="department" name="department" required>
                            <option value="">Select Department</option>
                            <option value="AIDS">AI & Data Science</option>
                            <option value="CY">Cyber Security</option>
                            <option value="CSE">Computer Science</option>
                            <option value="AIML">AI & Machine Learning</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="designation">Designation</label>
                        <input type="text" id="designation" name="designation" required>
                    </div>
                    <div class="form-group">
                        <label for="subjects">Subjects</label>
                        <input type="text" id="subjects" name="subjects" required>
                    </div>
                </form>
            `;
            
            showModal('Add New Faculty', content, async (modal) => {
                try {
                    const form = modal.querySelector('#facultyForm');
                    const formData = Object.fromEntries(new FormData(form));
                    
                    const errors = validateForm(formData, ['name', 'email', 'department', 'designation', 'subjects']);
                    if (errors.length > 0) {
                        showNotification(errors.join('\n'), 'error');
                        return;
                    }
                    
                    const response = await api.post('/api/faculty', formData);
                    if (response.error) throw new Error(response.error);
                    
                    showNotification('Faculty added successfully');
                    loadFacultyData();
                    modal.remove();
                } catch (error) {
                    handleError(error, 'addFaculty');
                }
            });
        });
    }

    if (addCourseBtn) {
        addCourseBtn.addEventListener('click', () => {
            const content = `
                <form id="courseForm">
                    <div class="form-group">
                        <label for="code">Course Code</label>
                        <input type="text" id="code" name="code" required>
                    </div>
                    <div class="form-group">
                        <label for="name">Course Name</label>
                        <input type="text" id="name" name="name" required>
                    </div>
                    <div class="form-group">
                        <label for="department">Department</label>
                        <select id="department" name="department" required>
                            <option value="">Select Department</option>
                            <option value="AIDS">AI & Data Science</option>
                            <option value="CY">Cyber Security</option>
                            <option value="CSE">Computer Science</option>
                            <option value="AIML">AI & Machine Learning</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="credits">Credits</label>
                        <input type="number" id="credits" name="credits" required>
                    </div>
                    <div class="form-group">
                        <label for="semester">Semester</label>
                        <select id="semester" name="semester" required>
                            <option value="">Select Semester</option>
                            <option value="SEM1">Semester 1</option>
                            <option value="SEM2">Semester 2</option>
                            <option value="SEM3">Semester 3</option>
                            <option value="SEM4">Semester 4</option>
                            <option value="SEM5">Semester 5</option>
                            <option value="SEM6">Semester 6</option>
                            <option value="SEM7">Semester 7</option>
                            <option value="SEM8">Semester 8</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="faculty">Faculty</label>
                        <select id="faculty" name="faculty" required>
                            <option value="">Select Faculty</option>
                        </select>
                    </div>
                </form>
            `;
            
            showModal('Add New Course', content, async (modal) => {
                try {
                    const form = modal.querySelector('#courseForm');
                    const formData = Object.fromEntries(new FormData(form));
                    
                    const errors = validateForm(formData, ['code', 'name', 'department', 'credits', 'semester', 'faculty']);
                    if (errors.length > 0) {
                        showNotification(errors.join('\n'), 'error');
                        return;
                    }

                    // Fetch existing faculty to populate the dropdown
                    const facultyData = await api.get('/api/faculty');
                    if (facultyData.error) throw new Error(facultyData.error);

                    const facultyOptions = facultyData.faculty.map(f => `<option value="${f.email}">${f.name} (${f.email})</option>`).join('');
                    modal.querySelector('#faculty').innerHTML = `<option value="">Select Faculty</option>${facultyOptions}`;

                    const response = await api.post('/api/courses', formData);
                    if (response.error) throw new Error(response.error);
                    
                    showNotification('Course added successfully');
                    loadCourseData();
                    modal.remove();
                } catch (error) {
                    handleError(error, 'addCourse');
                }
            });
        });
    }

    if (generateTimetableBtn) {
        generateTimetableBtn.addEventListener('click', () => {
            loadTimetable();
        });
    }

    if (scheduleExamBtn) {
        scheduleExamBtn.addEventListener('click', () => {
            const content = `
                <form id="examForm">
                    <div class="form-group">
                        <label for="examType">Exam Type</label>
                        <select id="examType" name="examType" required>
                            <option value="">Select Exam Type</option>
                            <option value="Midterm">Midterm</option>
                            <option value="Final">Final</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="examDepartment">Department</label>
                        <select id="examDepartment" name="examDepartment" required>
                            <option value="">Select Department</option>
                            <option value="AIDS">AI & Data Science</option>
                            <option value="CY">Cyber Security</option>
                            <option value="CSE">Computer Science</option>
                            <option value="AIML">AI & Machine Learning</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="examYear">Year</label>
                        <select id="examYear" name="examYear" required>
                            <option value="">Select Year</option>
                            <option value="FY">First Year</option>
                            <option value="SY">Second Year</option>
                            <option value="TY">Third Year</option>
                            <option value="LY">Fourth Year</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="examSemester">Semester</label>
                        <select id="examSemester" name="examSemester" required>
                            <option value="">Select Semester</option>
                            <option value="SEM1">Semester 1</option>
                            <option value="SEM2">Semester 2</option>
                            <option value="SEM3">Semester 3</option>
                            <option value="SEM4">Semester 4</option>
                            <option value="SEM5">Semester 5</option>
                            <option value="SEM6">Semester 6</option>
                            <option value="SEM7">Semester 7</option>
                            <option value="SEM8">Semester 8</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="examDate">Date</label>
                        <input type="date" id="examDate" name="examDate" required>
                    </div>
                    <div class="form-group">
                        <label for="examRoom">Room</label>
                        <input type="text" id="examRoom" name="examRoom" required>
                    </div>
                    <div class="form-group">
                        <label for="examFaculty">Invigilator</label>
                        <select id="examFaculty" name="examFaculty" required>
                            <option value="">Select Invigilator</option>
                        </select>
                    </div>
                </form>
            `;

            showModal('Schedule New Exam', content, async (modal) => {
                try {
                    const form = modal.querySelector('#examForm');
                    const formData = Object.fromEntries(new FormData(form));
                    
                    const errors = validateForm(formData, ['examType', 'examDepartment', 'examYear', 'examSemester', 'examDate', 'examRoom', 'examFaculty']);
                    if (errors.length > 0) {
                        showNotification(errors.join('\n'), 'error');
                        return;
                    }

                    // Fetch existing faculty to populate the dropdown
                    const facultyData = await api.get('/api/faculty');
                    if (facultyData.error) throw new Error(facultyData.error);

                    const facultyOptions = facultyData.faculty.map(f => `<option value="${f.email}">${f.name} (${f.email})</option>`).join('');
                    modal.querySelector('#examFaculty').innerHTML = `<option value="">Select Invigilator</option>${facultyOptions}`;

                    const response = await api.post('/api/exams', formData);
                    if (response.error) throw new Error(response.error);
                    
                    showNotification('Exam scheduled successfully');
                    // Reload attendance records to show new exam
                    loadAttendanceRecords();
                    modal.remove();
                } catch (error) {
                    handleError(error, 'scheduleExam');
                }
            });
        });
    }

    if (uploadResultsBtn) {
        uploadResultsBtn.addEventListener('click', () => {
            const content = `
                <form id="resultsForm">
                    <div class="form-group">
                        <label for="resultsDepartment">Department</label>
                        <select id="resultsDepartment" name="resultsDepartment" required>
                            <option value="">Select Department</option>
                            <option value="AIDS">AI & Data Science</option>
                            <option value="CY">Cyber Security</option>
                            <option value="CSE">Computer Science</option>
                            <option value="AIML">AI & Machine Learning</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="resultsExamType">Exam Type</label>
                        <select id="resultsExamType" name="resultsExamType" required>
                            <option value="">Select Exam Type</option>
                            <option value="Midterm">Midterm</option>
                            <option value="Final">Final</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="resultsYear">Year</label>
                        <select id="resultsYear" name="resultsYear" required>
                            <option value="">Select Year</option>
                            <option value="FY">First Year</option>
                            <option value="SY">Second Year</option>
                            <option value="TY">Third Year</option>
                            <option value="LY">Fourth Year</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="resultsSemester">Semester</label>
                        <select id="resultsSemester" name="resultsSemester" required>
                            <option value="">Select Semester</option>
                            <option value="SEM1">Semester 1</option>
                            <option value="SEM2">Semester 2</option>
                            <option value="SEM3">Semester 3</option>
                            <option value="SEM4">Semester 4</option>
                            <option value="SEM5">Semester 5</option>
                            <option value="SEM6">Semester 6</option>
                            <option value="SEM7">Semester 7</option>
                            <option value="SEM8">Semester 8</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="resultsDate">Date</label>
                        <input type="date" id="resultsDate" name="resultsDate" required>
                    </div>
                    <div class="form-group">
                        <label for="resultsFile">Results File (CSV)</label>
                        <input type="file" id="resultsFile" name="resultsFile" accept=".csv" required>
                    </div>
                </form>
            `;

            showModal('Upload Results', content, async (modal) => {
                try {
                    const form = modal.querySelector('#resultsForm');
                    const formData = new FormData(form);
                    
                    const errors = validateForm(Object.fromEntries(formData), ['resultsDepartment', 'resultsExamType', 'resultsYear', 'resultsSemester', 'resultsDate', 'resultsFile']);
                    if (errors.length > 0) {
                        showNotification(errors.join('\n'), 'error');
                        return;
                    }

                    const response = await api.post('/api/results', formData);
                    if (response.error) throw new Error(response.error);
                    
                    showNotification('Results uploaded successfully');
                    // Reload attendance records to show new results
                    loadAttendanceRecords();
                    modal.remove();
                } catch (error) {
                    handleError(error, 'uploadResults');
                }
            });
        });
    }

    if (addBookBtn) {
        addBookBtn.addEventListener('click', () => {
            const content = `
                <form id="bookForm">
                    <div class="form-group">
                        <label for="bookTitle">Title</label>
                        <input type="text" id="bookTitle" name="bookTitle" required>
                    </div>
                    <div class="form-group">
                        <label for="bookAuthor">Author</label>
                        <input type="text" id="bookAuthor" name="bookAuthor">
                    </div>
                    <div class="form-group">
                        <label for="bookCategory">Category</label>
                        <select id="bookCategory" name="bookCategory" required>
                            <option value="">Select Category</option>
                            <option value="Computer Science">Computer Science</option>
                            <option value="Mathematics">Mathematics</option>
                            <option value="Physics">Physics</option>
                            <option value="Chemistry">Chemistry</option>
                            <option value="Biology">Biology</option>
                            <option value="Electronics">Electronics</option>
                            <option value="Others">Others</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="bookStatus">Status</label>
                        <select id="bookStatus" name="bookStatus" required>
                            <option value="">Select Status</option>
                            <option value="Available">Available</option>
                            <option value="Issued">Issued</option>
                            <option value="Damaged">Damaged</option>
                            <option value="Lost">Lost</option>
                        </select>
                    </div>
                </form>
            `;

            showModal('Add New Book', content, async (modal) => {
                try {
                    const form = modal.querySelector('#bookForm');
                    const formData = Object.fromEntries(new FormData(form));
                    
                    const errors = validateForm(formData, ['bookTitle', 'bookCategory', 'bookStatus']);
                    if (errors.length > 0) {
                        showNotification(errors.join('\n'), 'error');
                        return;
                    }

                    const response = await api.post('/api/books', formData);
                    if (response.error) throw new Error(response.error);
                    
                    showNotification('Book added successfully');
                    loadLibraryData();
                    modal.remove();
                } catch (error) {
                    handleError(error, 'addBook');
                }
            });
        });
    }

    if (generateChallanBtn) {
        generateChallanBtn.addEventListener('click', () => {
            const content = `
                <form id="challanForm">
                    <div class="form-group">
                        <label for="challanDepartment">Department</label>
                        <select id="challanDepartment" name="challanDepartment" required>
                            <option value="">Select Department</option>
                            <option value="AIDS">AI & Data Science</option>
                            <option value="CY">Cyber Security</option>
                            <option value="CSE">Computer Science</option>
                            <option value="AIML">AI & Machine Learning</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="challanYear">Year</label>
                        <select id="challanYear" name="challanYear" required>
                            <option value="">Select Year</option>
                            <option value="FY">First Year</option>
                            <option value="SY">Second Year</option>
                            <option value="TY">Third Year</option>
                            <option value="LY">Fourth Year</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="challanSemester">Semester</label>
                        <select id="challanSemester" name="challanSemester" required>
                            <option value="">Select Semester</option>
                            <option value="SEM1">Semester 1</option>
                            <option value="SEM2">Semester 2</option>
                            <option value="SEM3">Semester 3</option>
                            <option value="SEM4">Semester 4</option>
                            <option value="SEM5">Semester 5</option>
                            <option value="SEM6">Semester 6</option>
                            <option value="SEM7">Semester 7</option>
                            <option value="SEM8">Semester 8</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="challanDate">Date</label>
                        <input type="date" id="challanDate" name="challanDate" required>
                    </div>
                    <div class="form-group">
                        <label for="challanAmount">Amount</label>
                        <input type="number" id="challanAmount" name="challanAmount" required>
                    </div>
                    <div class="form-group">
                        <label for="challanStudent">Student</label>
                        <select id="challanStudent" name="challanStudent" required>
                            <option value="">Select Student</option>
                        </select>
                    </div>
                </form>
            `;

            showModal('Generate Fee Challan', content, async (modal) => {
                try {
                    const form = modal.querySelector('#challanForm');
                    const formData = Object.fromEntries(new FormData(form));
                    
                    const errors = validateForm(formData, ['challanDepartment', 'challanYear', 'challanSemester', 'challanDate', 'challanAmount', 'challanStudent']);
                    if (errors.length > 0) {
                        showNotification(errors.join('\n'), 'error');
                        return;
                    }

                    // Fetch existing students to populate the dropdown
                    const studentData = await api.get('/api/students');
                    if (studentData.error) throw new Error(studentData.error);

                    const studentOptions = studentData.students.map(s => `<option value="${s.email}">${s.name} (${s.email})</option>`).join('');
                    modal.querySelector('#challanStudent').innerHTML = `<option value="">Select Student</option>${studentOptions}`;

                    const response = await api.post('/api/challans', formData);
                    if (response.error) throw new Error(response.error);
                    
                    showNotification('Challan generated successfully');
                    loadFeesData();
                    modal.remove();
                } catch (error) {
                    handleError(error, 'generateChallan');
                }
            });
        });
    }

    if (createNotificationBtn) {
        createNotificationBtn.addEventListener('click', () => {
            const content = `
                <form id="notificationForm">
                    <div class="form-group">
                        <label for="notificationType">Type</label>
                        <select id="notificationType" name="notificationType" required>
                            <option value="">Select Type</option>
                            <option value="Announcement">Announcement</option>
                            <option value="Event">Event</option>
                            <option value="Notice">Notice</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="notificationStatus">Status</label>
                        <select id="notificationStatus" name="notificationStatus" required>
                            <option value="">Select Status</option>
                            <option value="Active">Active</option>
                            <option value="Inactive">Inactive</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="notificationMessage">Message</label>
                        <textarea id="notificationMessage" name="notificationMessage" rows="5" required></textarea>
                    </div>
                </form>
            `;

            showModal('Create New Notification', content, async (modal) => {
                try {
                    const form = modal.querySelector('#notificationForm');
                    const formData = Object.fromEntries(new FormData(form));
                    
                    const errors = validateForm(formData, ['notificationType', 'notificationStatus', 'notificationMessage']);
                    if (errors.length > 0) {
                        showNotification(errors.join('\n'), 'error');
                        return;
                    }

                    const response = await api.post('/api/notifications', formData);
                    if (response.error) throw new Error(response.error);
                    
                    showNotification('Notification created successfully');
                    loadNotifications();
                    modal.remove();
                } catch (error) {
                    handleError(error, 'createNotification');
                }
            });
        });
    }

    if (scheduleNotificationBtn) {
        scheduleNotificationBtn.addEventListener('click', () => {
            const content = `
                <form id="scheduleNotificationForm">
                    <div class="form-group">
                        <label for="scheduleNotificationType">Type</label>
                        <select id="scheduleNotificationType" name="scheduleNotificationType" required>
                            <option value="">Select Type</option>
                            <option value="Announcement">Announcement</option>
                            <option value="Event">Event</option>
                            <option value="Notice">Notice</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="scheduleNotificationStatus">Status</label>
                        <select id="scheduleNotificationStatus" name="scheduleNotificationStatus" required>
                            <option value="">Select Status</option>
                            <option value="Active">Active</option>
                            <option value="Inactive">Inactive</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="scheduleNotificationMessage">Message</label>
                        <textarea id="scheduleNotificationMessage" name="scheduleNotificationMessage" rows="5" required></textarea>
                    </div>
                    <div class="form-group">
                        <label for="scheduleNotificationDate">Date</label>
                        <input type="date" id="scheduleNotificationDate" name="scheduleNotificationDate" required>
                    </div>
                </form>
            `;

            showModal('Schedule New Notification', content, async (modal) => {
                try {
                    const form = modal.querySelector('#scheduleNotificationForm');
                    const formData = Object.fromEntries(new FormData(form));
                    
                    const errors = validateForm(formData, ['scheduleNotificationType', 'scheduleNotificationStatus', 'scheduleNotificationMessage', 'scheduleNotificationDate']);
                    if (errors.length > 0) {
                        showNotification(errors.join('\n'), 'error');
                        return;
                    }

                    const response = await api.post('/api/scheduled-notifications', formData);
                    if (response.error) throw new Error(response.error);
                    
                    showNotification('Notification scheduled successfully');
                    loadNotifications();
                    modal.remove();
                } catch (error) {
                    handleError(error, 'scheduleNotification');
                }
            });
        });
    }

    // Load data when switching sections
    sidebarLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            
            // Update active link
            sidebarLinks.forEach(l => l.parentElement.classList.remove('active'));
            this.parentElement.classList.add('active');
            
            // Show corresponding section
            const targetId = this.getAttribute('data-section');
            contentSections.forEach(section => section.classList.remove('active'));
            document.getElementById(targetId).classList.add('active');
            
            // Load section data
            switch (targetId) {
                case 'faculty-section':
                    loadFacultyData();
                    break;
                case 'courses-section':
                    loadCourseData();
                    break;
                case 'timetable-section':
                    loadTimetable();
                    break;
                case 'dashboard-section':
                    loadDashboardStats();
                    initCharts();
                    break;
                // Add cases for other sections
            }
        });
    });

    // Initialize components
    function initializeComponents() {
        // Initialize date pickers
        const dateInputs = document.querySelectorAll('input[type="date"]');
        dateInputs.forEach(input => {
            flatpickr(input, {
                dateFormat: "Y-m-d"
            });
        });

        // Initialize select2 for searchable dropdowns
        const searchableSelects = document.querySelectorAll('.searchable-select');
        searchableSelects.forEach(select => {
            $(select).select2({
                width: '100%',
                placeholder: select.dataset.placeholder || 'Select an option'
            });
        });

        // Initialize tooltips
        const tooltips = document.querySelectorAll('[data-tooltip]');
        tooltips.forEach(element => {
            tippy(element, {
                content: element.dataset.tooltip,
                placement: 'top'
            });
        });
    }

    // Load data when switching sections
    sidebarLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            
            // Update active link
            sidebarLinks.forEach(l => l.parentElement.classList.remove('active'));
            this.parentElement.classList.add('active');
            
            // Show corresponding section
            const targetId = this.getAttribute('data-section');
            contentSections.forEach(section => section.classList.remove('active'));
            document.getElementById(targetId).classList.add('active');
            
            // Load section data
            switch (targetId) {
                case 'faculty-section':
                    loadFacultyData();
                    break;
                case 'courses-section':
                    loadCourseData();
                    break;
                case 'timetable-section':
                    loadTimetable();
                    break;
                case 'dashboard-section':
                    loadDashboardStats();
                    initCharts();
                    break;
                // Add cases for other sections
            }
        });
    });

    // Initialize everything
    initializeComponents();
    loadDashboardStats();
    initCharts();

    // Mobile menu toggle
    const menuToggle = document.getElementById('menuToggle');
    const sidebar = document.querySelector('.admin-sidebar');
    const mainContent = document.querySelector('.admin-main');

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

    // Initialize sidebar navigation
    initSidebarNavigation();

    // Initialize dark mode
    initDarkMode();

    // Initialize dashboard
    loadDashboardStats();
    initCharts();
    setupQRGeneration();
    setupAttendanceRecords();
    setupStudentManagement();

    // Handle logout
    const logoutBtn = document.querySelector('.logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            window.location.href = '/logout';
        });
    }
});

// Sidebar navigation initialization
function initSidebarNavigation() {
    const sidebarLinks = document.querySelectorAll('.sidebar-link');
    const contentSections = document.querySelectorAll('.content-section');

    sidebarLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            
            // Remove active class from all links and sections
            sidebarLinks.forEach(l => l.parentElement.classList.remove('active'));
            contentSections.forEach(section => section.classList.remove('active'));
            
            // Add active class to clicked link and corresponding section
            link.parentElement.classList.add('active');
            const sectionId = link.getAttribute('data-section');
            document.getElementById(sectionId).classList.add('active');
            
            // Close sidebar on mobile after navigation
            if (window.innerWidth <= 768) {
                document.querySelector('.admin-sidebar').classList.remove('active');
            }
        });
    });
}

// Dark mode initialization
function initDarkMode() {
    const darkModeToggle = document.getElementById('darkModeToggle');
    const body = document.body;
    const darkModeIcon = darkModeToggle.querySelector('i');

    // Check for saved dark mode preference
    if (localStorage.getItem('darkMode') === 'enabled') {
        body.classList.add('dark-mode');
        darkModeIcon.classList.replace('fa-moon', 'fa-sun');
    }

    darkModeToggle.addEventListener('click', () => {
        body.classList.toggle('dark-mode');
        
        if (body.classList.contains('dark-mode')) {
            localStorage.setItem('darkMode', 'enabled');
            darkModeIcon.classList.replace('fa-moon', 'fa-sun');
        } else {
            localStorage.setItem('darkMode', 'disabled');
            darkModeIcon.classList.replace('fa-sun', 'fa-moon');
        }
    });
}

// Rest of your existing JavaScript code...
